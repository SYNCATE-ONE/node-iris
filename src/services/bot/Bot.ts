/**
 * Refactored Bot class using manager pattern
 * 다중 WebSocket 연결 및 메시지 큐 지원
 */

import { BaseController } from '@/controllers/BaseController';
import { setGlobalDebugLogger } from '@/decorators';
import {
  BatchScheduler,
  ScheduledMessage,
} from '@/services/core/BatchScheduler';
import { IrisAPI } from '@/services/core/IrisAPI';
import { IrisRequest } from '@/types/models/base';
import { EventEmitter, EventEmitterOptions } from '@/utils/event-emitter';
import { Logger } from '@/utils/logger';
import { AsyncMessageQueue, MessageQueueOptions } from './AsyncMessageQueue';
import { ConnectionManager } from './ConnectionManager';
import { ControllerManager } from './ControllerManager';
import { EventManager } from './EventManager';
import { MessageProcessor } from './MessageProcessor';
import {
  MultiConnectionManager,
  ConnectionConfig,
  MultiConnectionManagerOptions,
} from './MultiConnectionManager';
import { WebhookManager } from './WebhookManager';

export type EventHandler = (context: any) => void | Promise<void>;
export type ErrorHandler = (context: any) => void | Promise<void>;

export interface BotOptions {
  maxWorkers?: number;
  saveChatLogs?: boolean;
  autoRegisterControllers?: boolean;
  httpMode?: boolean; // HTTP 웹훅 모드 활성화
  webhookPort?: number; // 웹훅 서버 포트 (기본: 3001)
  webhookPath?: string; // 웹훅 엔드포인트 경로 (기본: /webhook/message)
  logLevel?: 'error' | 'warn' | 'info' | 'debug'; // 로그 레벨 설정

  // 다중 연결 옵션
  multiConnection?: boolean; // 다중 연결 모드 활성화
  connections?: ConnectionConfig[]; // 연결 설정 목록
  connectionOptions?: MultiConnectionManagerOptions; // 연결 관리자 옵션

  // 메시지 큐 옵션
  useMessageQueue?: boolean; // 메시지 큐 사용 여부
  messageQueueOptions?: MessageQueueOptions; // 메시지 큐 옵션

  // 이벤트 처리 옵션
  parallelEventHandling?: boolean; // 이벤트 핸들러 병렬 실행 여부
  eventTimeout?: number; // 이벤트 핸들러 타임아웃 (ms)
}

export class Bot {
  private static instance: Bot | null = null;
  private static globalLogLevel: 'error' | 'warn' | 'info' | 'debug' = 'info';

  // Core components
  private logger: Logger;
  private bootstrapLogger: Logger;
  public api: IrisAPI;
  public name: string;
  private irisUrl: string;

  // Managers
  private connectionManager!: ConnectionManager;
  private multiConnectionManager?: MultiConnectionManager;
  private webhookManager!: WebhookManager;
  private eventManager!: EventManager;
  private controllerManager!: ControllerManager;
  private messageProcessor!: MessageProcessor;
  private batchScheduler!: BatchScheduler;
  private messageQueue?: AsyncMessageQueue;

  // Configuration
  private httpMode: boolean;
  private multiConnectionMode: boolean;
  private useMessageQueue: boolean;
  private emitter: EventEmitter;

  /**
   * Get global log level for debugging
   */
  static getGlobalLogLevel(): 'error' | 'warn' | 'info' | 'debug' {
    return Bot.globalLogLevel;
  }

  /**
   * Create a logger with the global log level
   */
  static createLogger(name: string): Logger {
    return new Logger(name, { logLevel: Bot.globalLogLevel });
  }

  constructor(name: string, irisUrl: string, options: BotOptions = {}) {
    this.name = name;

    // EventEmitter 옵션 설정
    const emitterOptions: EventEmitterOptions = {
      maxWorkers: options.maxWorkers,
      parallelExecution: options.parallelEventHandling ?? true,
      timeout: options.eventTimeout ?? 30000,
    };
    this.emitter = new EventEmitter(emitterOptions);

    // EventEmitter 메모리 누수 방지를 위해 maxListeners 증가
    process.setMaxListeners(20);

    // 전역 로그 레벨 설정
    Bot.globalLogLevel = options.logLevel || 'info';
    this.logger = new Logger('Bot', {
      saveChatLogs: options.saveChatLogs,
      logLevel: Bot.globalLogLevel,
    });
    this.bootstrapLogger = new Logger('Bootstrap', {
      logLevel: Bot.globalLogLevel,
    });

    // Set global debug logger for decorators
    const debugLogger = new Logger('DecoratorMetadata', {
      logLevel: Bot.globalLogLevel,
    });
    setGlobalDebugLogger(debugLogger);

    // Set static instance
    Bot.instance = this;

    // HTTP 웹훅 모드 설정
    this.httpMode = options.httpMode || false;

    // 다중 연결 모드 설정
    this.multiConnectionMode = options.multiConnection || false;

    // 메시지 큐 사용 여부 (기본: true)
    this.useMessageQueue = options.useMessageQueue ?? true;

    // Clean up the URL similar to Python implementation
    this.irisUrl = irisUrl
      .replace(/^https?:\/\//, '')
      .replace(/^wss?:\/\//, '')
      .replace(/\/$/, '');

    // Validate URL format
    const urlParts = this.irisUrl.split(':');
    if (urlParts.length !== 2 || urlParts[0].split('.').length !== 4) {
      throw new Error(
        'Iris endpoint Address must be in IP:PORT format. ex) 172.30.10.66:3000'
      );
    }

    this.api = new IrisAPI(`http://${this.irisUrl}`);

    // Initialize managers
    this.initializeManagers(options);
  }

  /**
   * Initialize all manager instances
   */
  private initializeManagers(options: BotOptions): void {
    // Initialize BatchScheduler
    this.batchScheduler = BatchScheduler.getInstance();

    // Initialize EventManager
    this.eventManager = new EventManager(this.emitter, this.logger);

    // Initialize MessageProcessor
    this.messageProcessor = new MessageProcessor(this.eventManager, this.api);

    // Initialize ControllerManager
    this.controllerManager = new ControllerManager(
      this.bootstrapLogger,
      this.batchScheduler,
      this.eventManager,
      { autoRegisterControllers: options.autoRegisterControllers }
    );

    // Initialize ConnectionManager (단일 연결용)
    this.connectionManager = new ConnectionManager(
      this.irisUrl,
      this.api,
      this.logger
    );

    // Initialize MultiConnectionManager (다중 연결용)
    if (this.multiConnectionMode) {
      this.multiConnectionManager = new MultiConnectionManager(
        this.logger,
        options.connectionOptions
      );

      // 기본 연결 추가
      this.multiConnectionManager.addConnection({
        id: 'default',
        url: this.irisUrl,
      });

      // 추가 연결 설정이 있으면 추가
      if (options.connections) {
        this.multiConnectionManager.addConnections(options.connections);
      }
    }

    // Initialize MessageQueue (메시지 큐)
    if (this.useMessageQueue) {
      this.messageQueue = new AsyncMessageQueue(this.logger, {
        maxConcurrent: options.messageQueueOptions?.maxConcurrent ?? 10,
        maxQueueSize: options.messageQueueOptions?.maxQueueSize ?? 1000,
        maxRetries: options.messageQueueOptions?.maxRetries ?? 3,
        processingTimeout:
          options.messageQueueOptions?.processingTimeout ?? 30000,
        ...options.messageQueueOptions,
      });
    }

    // Initialize WebhookManager
    this.webhookManager = new WebhookManager(this.name, this.logger, {
      port: options.webhookPort,
      path: options.webhookPath,
    });

    // Set up message handlers
    this.setupMessageHandlers();

    // Set up API resolver for multi-connection support
    this.setupApiResolver();
  }

  /**
   * Setup API resolver for multi-connection support
   * This allows MessageProcessor to route responses to the correct connection
   */
  private setupApiResolver(): void {
    this.messageProcessor.setApiResolver((connectionId: string) => {
      // webhook 연결인 경우 기본 API 사용
      if (connectionId === 'webhook') {
        return this.api;
      }

      // 다중 연결 모드인 경우 해당 연결의 API 반환
      if (this.multiConnectionManager) {
        const api = this.multiConnectionManager.getApi(connectionId);
        if (api) return api;
      }

      // 기본 API 반환
      return this.api;
    });
  }

  /**
   * Setup message handlers for managers
   */
  private setupMessageHandlers(): void {
    // 공통 메시지 처리 함수
    const processMessage = async (data: IrisRequest, connectionId?: string) => {
      // 연결 ID를 데이터에 추가 (다중 연결 시 식별용)
      if (connectionId) {
        (data as any)._connectionId = connectionId;
      }
      await this.messageProcessor.processIrisRequest(data);
    };

    // 메시지 큐 사용 시
    if (this.messageQueue) {
      this.messageQueue.setMessageHandler(processMessage);

      // 큐에 메시지 추가하는 핸들러
      const queueMessage = async (
        data: IrisRequest,
        connectionId: string = 'default'
      ) => {
        this.messageQueue!.enqueue(data, connectionId);
      };

      // Setup message handler for connection manager
      this.connectionManager.setMessageHandler(async (data: IrisRequest) => {
        await queueMessage(data, 'default');
      });

      // Setup message handler for multi-connection manager
      if (this.multiConnectionManager) {
        this.multiConnectionManager.setMessageHandler(queueMessage);
      }

      // Setup message handler for webhook manager
      this.webhookManager.setMessageHandler(async (data: IrisRequest) => {
        await queueMessage(data, 'webhook');
      });
    } else {
      // 메시지 큐 미사용 시 직접 처리
      this.connectionManager.setMessageHandler(async (data: IrisRequest) => {
        await processMessage(data, 'default');
      });

      if (this.multiConnectionManager) {
        this.multiConnectionManager.setMessageHandler(processMessage);
      }

      this.webhookManager.setMessageHandler(async (data: IrisRequest) => {
        await processMessage(data, 'webhook');
      });
    }
  }

  /**
   * Get the current Bot instance
   */
  static getInstance(): Bot | null {
    return Bot.instance;
  }

  /**
   * Get the current Bot instance (throws if not initialized)
   */
  static requireInstance(): Bot {
    if (!Bot.instance) {
      throw new Error(
        'Bot instance not initialized. Create a Bot instance first.'
      );
    }
    return Bot.instance;
  }

  /**
   * Register an event handler
   */
  onEvent(
    name: string
  ): (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) => void {
    return (
      target: any,
      propertyKey: string,
      descriptor: PropertyDescriptor
    ) => {
      const originalMethod = descriptor.value;
      this.emitter.on(name, originalMethod.bind(target));
      return descriptor;
    };
  }

  /**
   * Register event handlers manually
   */
  on(event: 'chat', handler: EventHandler): void;
  on(event: 'message', handler: EventHandler): void;
  on(event: 'new_member', handler: EventHandler): void;
  on(event: 'del_member', handler: EventHandler): void;
  on(event: 'feed', handler: EventHandler): void;
  on(event: 'unknown', handler: EventHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
  on(event: string, handler: EventHandler | ErrorHandler): void {
    this.eventManager.on(event as any, handler as any);
  }

  /**
   * Remove event handler
   */
  off(event: string, handler: EventHandler | ErrorHandler): void {
    this.eventManager.off(event, handler as any);
  }

  /**
   * Register a controller with the bot
   */
  addController(controller: BaseController): void {
    this.controllerManager.addController(controller);
  }

  /**
   * Register multiple controllers
   */
  addControllers(...controllers: BaseController[]): void {
    this.controllerManager.addControllers(...controllers);
  }

  /**
   * Register controllers from constructor classes
   */
  registerControllers(controllerClasses: Array<new () => any>): void {
    this.controllerManager.registerControllers(controllerClasses);
  }

  /**
   * Start the bot and connect to Iris server
   */
  async run(): Promise<void> {
    // Run bootstrap handlers first
    try {
      this.logger.info('Running bootstrap handlers...');
      await this.batchScheduler.runBootstrap();
    } catch (error) {
      this.logger.error('Bootstrap error:', error);
    }

    // Start batch scheduler
    this.batchScheduler.start();
    this.logger.info('Batch scheduler started');

    // Start message queue if enabled
    if (this.messageQueue) {
      this.messageQueue.start();
      this.logger.info('Message queue started');
    }

    // Set up scheduled message handler
    this.batchScheduler.onScheduledMessage(
      async (scheduledMessage: ScheduledMessage) => {
        try {
          await this.api.reply(
            scheduledMessage.roomId,
            scheduledMessage.message
          );
          this.logger.info(
            `Sent scheduled message to room ${scheduledMessage.roomId}: ${scheduledMessage.message}`
          );
        } catch (error) {
          this.logger.error('Failed to send scheduled message:', error);
        }
      }
    );

    // HTTP 웹훅 모드인 경우
    if (this.httpMode) {
      this.logger.info('Starting in HTTP webhook mode');

      // Initialize bot info
      if (this.multiConnectionMode && this.multiConnectionManager) {
        await this.multiConnectionManager.initializeBotInfo();
        const botId = this.multiConnectionManager.getBotId();
        if (botId) {
          this.messageProcessor.setBotId(botId);
        }
      } else {
        await this.connectionManager.initializeBotInfo();
        const botId = this.connectionManager.getBotId();
        if (botId) {
          this.messageProcessor.setBotId(botId);
        }
      }

      // Start webhook server
      this.webhookManager.start();

      // Keep process alive
      return this.webhookManager.keepAlive();
    }

    // 다중 연결 모드인 경우
    if (this.multiConnectionMode && this.multiConnectionManager) {
      this.logger.info('Starting in Multi-WebSocket mode');

      // 모든 연결 시작
      await this.multiConnectionManager.connectAll();

      // 봇 ID 설정
      const botId = this.multiConnectionManager.getBotId();
      if (botId) {
        this.messageProcessor.setBotId(botId);
      }

      // 연결 상태 주기적 로깅
      this.logConnectionStats();

      // Keep process alive
      return new Promise(() => {});
    }

    // WebSocket 모드 (기본 - 단일 연결)
    this.logger.info('Starting in WebSocket mode');

    // Set bot ID for message processor when connection is established
    const botId = this.connectionManager.getBotId();
    if (botId) {
      this.messageProcessor.setBotId(botId);
    }

    // Start WebSocket connection with retry
    await this.connectionManager.connectWithRetry();
  }

  /**
   * 연결 상태 주기적 로깅
   */
  private logConnectionStats(): void {
    setInterval(() => {
      if (this.multiConnectionManager) {
        const stats = this.multiConnectionManager.getStats();
        this.logger.debug('Connection stats', stats);
      }
      if (this.messageQueue) {
        const queueStats = this.messageQueue.getStats();
        this.logger.debug('Message queue stats', queueStats);
      }
    }, 60000); // 1분마다
  }

  /**
   * 추가 Iris 서버 연결 추가 (런타임)
   */
  addConnection(config: ConnectionConfig): void {
    if (!this.multiConnectionManager) {
      this.logger.warn(
        'Multi-connection mode is not enabled. Enable it with multiConnection: true option.'
      );
      return;
    }
    this.multiConnectionManager.addConnection(config);
  }

  /**
   * 연결 통계 가져오기
   */
  getConnectionStats(): {
    total: number;
    connected: number;
    disconnected: number;
    error: number;
    totalMessages: number;
  } | null {
    if (this.multiConnectionManager) {
      return this.multiConnectionManager.getStats();
    }
    return null;
  }

  /**
   * 메시지 큐 통계 가져오기
   */
  getQueueStats(): {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    dropped: number;
    avgProcessingTime: number;
  } | null {
    if (this.messageQueue) {
      return this.messageQueue.getStats();
    }
    return null;
  }

  /**
   * Stop the bot
   */
  stop(): void {
    // Stop batch scheduler
    this.batchScheduler.stop();

    // Stop message queue
    if (this.messageQueue) {
      this.messageQueue.stop();
    }

    // Close connections
    this.connectionManager.close();
    if (this.multiConnectionManager) {
      this.multiConnectionManager.close();
    }
    this.webhookManager.stop();

    // Clear static instance
    if (Bot.instance === this) {
      Bot.instance = null;
    }

    this.logger.info('Bot stopped');
  }
}
