import { IrisRequest } from '@/types/models/base';
import { Logger } from '@/utils/logger';

export interface QueuedMessage {
  id: string;
  data: IrisRequest;
  connectionId: string;
  timestamp: number;
  retries: number;
  priority: number;
}

export interface MessageQueueOptions {
  maxConcurrent?: number; // 동시 처리 가능한 최대 메시지 수
  maxQueueSize?: number; // 최대 큐 크기
  maxRetries?: number; // 최대 재시도 횟수
  retryDelay?: number; // 재시도 지연 (ms)
  processingTimeout?: number; // 메시지 처리 타임아웃 (ms)
  priorityEnabled?: boolean; // 우선순위 처리 활성화
}

export interface MessageQueueStats {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  dropped: number;
  avgProcessingTime: number;
}

/**
 * 비동기 메시지 큐 시스템
 * 메시지를 큐에 넣고 여러 워커가 병렬로 처리
 */
export class AsyncMessageQueue {
  private queue: QueuedMessage[] = [];
  private processing: Set<string> = new Set();
  private logger: Logger;
  private options: Required<MessageQueueOptions>;
  private messageHandler?: (
    data: IrisRequest,
    connectionId: string
  ) => Promise<void>;
  private isRunning = false;
  private messageIdCounter = 0;

  // 통계
  private stats = {
    completed: 0,
    failed: 0,
    dropped: 0,
    totalProcessingTime: 0,
  };

  constructor(logger: Logger, options: MessageQueueOptions = {}) {
    this.logger = logger;
    this.options = {
      maxConcurrent: options.maxConcurrent ?? 10,
      maxQueueSize: options.maxQueueSize ?? 1000,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 100,
      processingTimeout: options.processingTimeout ?? 30000,
      priorityEnabled: options.priorityEnabled ?? true,
    };
  }

  /**
   * 메시지 핸들러 설정
   */
  setMessageHandler(
    handler: (data: IrisRequest, connectionId: string) => Promise<void>
  ): void {
    this.messageHandler = handler;
  }

  /**
   * 큐 시작
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.info('Message queue started', {
      maxConcurrent: this.options.maxConcurrent,
      maxQueueSize: this.options.maxQueueSize,
    });
    this.processQueue();
  }

  /**
   * 큐 중지
   */
  stop(): void {
    this.isRunning = false;
    this.logger.info('Message queue stopped', this.getStats());
  }

  /**
   * 메시지 추가
   */
  enqueue(
    data: IrisRequest,
    connectionId: string,
    priority: number = 0
  ): boolean {
    if (this.queue.length >= this.options.maxQueueSize) {
      this.stats.dropped++;
      this.logger.warn('Message queue full, dropping message', {
        queueSize: this.queue.length,
        maxSize: this.options.maxQueueSize,
      });
      return false;
    }

    const message: QueuedMessage = {
      id: `msg_${++this.messageIdCounter}_${Date.now()}`,
      data,
      connectionId,
      timestamp: Date.now(),
      retries: 0,
      priority,
    };

    if (this.options.priorityEnabled) {
      // 우선순위에 따라 삽입 위치 결정
      const insertIndex = this.queue.findIndex((m) => m.priority > priority);
      if (insertIndex === -1) {
        this.queue.push(message);
      } else {
        this.queue.splice(insertIndex, 0, message);
      }
    } else {
      this.queue.push(message);
    }

    this.logger.debug('Message enqueued', {
      messageId: message.id,
      queueSize: this.queue.length,
      processing: this.processing.size,
    });

    // 큐 처리 트리거
    this.processQueue();

    return true;
  }

  /**
   * 큐 처리 (메인 루프)
   */
  private async processQueue(): Promise<void> {
    if (!this.isRunning) return;

    while (
      this.queue.length > 0 &&
      this.processing.size < this.options.maxConcurrent
    ) {
      const message = this.queue.shift();
      if (!message) continue;

      this.processing.add(message.id);

      // 비동기로 처리 (await 하지 않음 - 병렬 처리)
      this.processMessage(message).finally(() => {
        this.processing.delete(message.id);
        // 처리 완료 후 다음 메시지 처리 시도
        if (this.isRunning && this.queue.length > 0) {
          setImmediate(() => this.processQueue());
        }
      });
    }
  }

  /**
   * 단일 메시지 처리
   */
  private async processMessage(message: QueuedMessage): Promise<void> {
    const startTime = Date.now();

    if (!this.messageHandler) {
      this.logger.warn('No message handler set');
      return;
    }

    try {
      // 타임아웃 처리
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Message processing timeout')),
          this.options.processingTimeout
        );
      });

      await Promise.race([
        this.messageHandler(message.data, message.connectionId),
        timeoutPromise,
      ]);

      const processingTime = Date.now() - startTime;
      this.stats.completed++;
      this.stats.totalProcessingTime += processingTime;

      this.logger.debug('Message processed successfully', {
        messageId: message.id,
        processingTime,
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;

      if (message.retries < this.options.maxRetries) {
        // 재시도
        message.retries++;
        this.logger.warn(
          `Message processing failed, retrying (${message.retries}/${this.options.maxRetries})`,
          {
            messageId: message.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        );

        // 재시도 지연 후 큐에 다시 추가
        await this.sleep(this.options.retryDelay * message.retries);

        if (this.isRunning) {
          // 우선순위를 높여서 다시 큐에 추가
          this.queue.unshift(message);
        }
      } else {
        this.stats.failed++;
        this.logger.error('Message processing failed after max retries', {
          messageId: message.id,
          retries: message.retries,
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTime,
        });
      }
    }
  }

  /**
   * 통계 가져오기
   */
  getStats(): MessageQueueStats {
    return {
      queued: this.queue.length,
      processing: this.processing.size,
      completed: this.stats.completed,
      failed: this.stats.failed,
      dropped: this.stats.dropped,
      avgProcessingTime:
        this.stats.completed > 0
          ? this.stats.totalProcessingTime / this.stats.completed
          : 0,
    };
  }

  /**
   * 큐 비우기
   */
  clear(): void {
    const cleared = this.queue.length;
    this.queue = [];
    this.logger.info(`Queue cleared: ${cleared} messages removed`);
  }

  /**
   * 현재 큐 크기 가져오기
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * 현재 처리 중인 메시지 수
   */
  get processingCount(): number {
    return this.processing.size;
  }

  /**
   * 큐가 비어있는지 확인
   */
  get isEmpty(): boolean {
    return this.queue.length === 0 && this.processing.size === 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
