/**
 * TypeScript port of iris.bot._internal.emitter
 * 병렬 처리 및 최적화 버전
 */

import { ErrorContext } from '@/types/models';
import { EventEmitter as NodeEventEmitter } from 'events';
import { Logger } from './logger';

export type EventHandler = (...args: any[]) => void | Promise<void>;

export interface EventEmitterOptions {
  maxWorkers?: number;
  parallelExecution?: boolean; // 핸들러를 병렬로 실행할지 여부
  timeout?: number; // 핸들러 타임아웃 (ms)
}

export class EventEmitter {
  private logger: Logger = new Logger('EventEmitter');
  private emitter: NodeEventEmitter;
  private maxWorkers: number;
  private parallelExecution: boolean;
  private timeout: number;

  // 처리 중인 이벤트 추적 (중복 처리 방지)
  private processingEvents: Map<string, Set<string>> = new Map();

  constructor(options: EventEmitterOptions | number = {}) {
    this.emitter = new NodeEventEmitter();

    // 이전 버전 호환성 (숫자만 전달된 경우)
    if (typeof options === 'number') {
      this.maxWorkers = options;
      this.parallelExecution = true;
      this.timeout = 30000;
    } else {
      this.maxWorkers = options.maxWorkers ?? 10;
      this.parallelExecution = options.parallelExecution ?? true;
      this.timeout = options.timeout ?? 30000;
    }

    // Increase max listeners to avoid warnings
    this.emitter.setMaxListeners(100);
  }

  on(event: string, handler: EventHandler): void {
    this.emitter.on(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    this.emitter.off(event, handler);
  }

  once(event: string, handler: EventHandler): void {
    this.emitter.once(event, handler);
  }

  /**
   * 이벤트 발생 - 핸들러들을 병렬로 실행
   */
  emit(event: string, args: any[] = []): void {
    // Get all listeners for this event
    const listeners = this.emitter.listeners(event);

    if (listeners.length === 0) {
      return;
    }

    if (this.parallelExecution) {
      // 모든 핸들러를 병렬로 실행 (각각 독립적으로)
      this.executeHandlersParallel(event, listeners as EventHandler[], args);
    } else {
      // 순차적으로 실행 (이전 동작)
      for (const listener of listeners) {
        this.executeHandler(event, listener as EventHandler, args);
      }
    }
  }

  /**
   * 이벤트 발생 및 완료 대기 (동기적 버전)
   */
  async emitAsync(event: string, args: any[] = []): Promise<void> {
    const listeners = this.emitter.listeners(event);

    if (listeners.length === 0) {
      return;
    }

    if (this.parallelExecution) {
      await this.executeHandlersParallelAsync(
        event,
        listeners as EventHandler[],
        args
      );
    } else {
      for (const listener of listeners) {
        await this.executeHandler(event, listener as EventHandler, args);
      }
    }
  }

  /**
   * 핸들러들을 병렬로 실행 (fire-and-forget)
   */
  private executeHandlersParallel(
    event: string,
    handlers: EventHandler[],
    args: any[]
  ): void {
    // 각 핸들러를 독립적으로 실행 (서로 영향을 주지 않음)
    for (const handler of handlers) {
      // setImmediate를 사용하여 이벤트 루프를 블록하지 않고 실행
      setImmediate(() => {
        this.executeHandler(event, handler, args).catch((error) => {
          this.logger.error(
            `Unhandled error in parallel handler for ${event}:`,
            error
          );
        });
      });
    }
  }

  /**
   * 핸들러들을 병렬로 실행하고 모든 완료 대기
   */
  private async executeHandlersParallelAsync(
    event: string,
    handlers: EventHandler[],
    args: any[]
  ): Promise<void> {
    const promises = handlers.map((handler) =>
      this.executeHandler(event, handler, args)
    );

    // 모든 핸들러 완료 대기 (에러가 발생해도 다른 핸들러는 계속 실행)
    const results = await Promise.allSettled(promises);

    // 에러 로깅
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(`Handler error in ${event}:`, result.reason);
      }
    }
  }

  /**
   * 단일 핸들러 실행 (타임아웃 포함)
   */
  private async executeHandler(
    event: string,
    handler: EventHandler,
    args: any[]
  ): Promise<void> {
    try {
      const result = handler(...args);

      // If handler returns a promise, wait for it with timeout
      if (result instanceof Promise) {
        if (this.timeout > 0) {
          await this.withTimeout(
            result,
            this.timeout,
            `Handler timeout for event: ${event}`
          );
        } else {
          await result;
        }
      }
    } catch (error) {
      // Emit error event
      const errorContext = new ErrorContext(
        event,
        handler,
        error as Error,
        args
      );

      // Don't emit error event if we're already handling an error to avoid infinite loops
      if (event !== 'error') {
        this.emitter.emit('error', errorContext);
      } else {
        this.logger.error('Error in error handler:', error);
      }
    }
  }

  /**
   * Promise에 타임아웃 적용
   */
  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  }

  removeAllListeners(event?: string): void {
    this.emitter.removeAllListeners(event);
  }

  listenerCount(event: string): number {
    return this.emitter.listenerCount(event);
  }

  /**
   * 이벤트에 등록된 리스너 목록 가져오기
   */
  listeners(event: string): EventHandler[] {
    return this.emitter.listeners(event) as EventHandler[];
  }

  /**
   * 모든 이벤트 이름 가져오기
   */
  eventNames(): (string | symbol)[] {
    return this.emitter.eventNames();
  }
}
