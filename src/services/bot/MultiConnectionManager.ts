import WebSocket = require('ws');
import { IrisAPI } from '@/services/core/IrisAPI';
import { IrisRequest } from '@/types/models/base';
import { safeJsonParseWithReviver } from '@/utils';
import { Logger } from '@/utils/logger';

export interface ConnectionConfig {
  id: string;
  url: string;
  enabled?: boolean;
  priority?: number; // 우선순위 (낮을수록 높은 우선순위)
}

export interface ConnectionState {
  id: string;
  url: string;
  status:
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'error';
  ws?: WebSocket;
  api: IrisAPI;
  botId?: string;
  reconnectAttempts: number;
  lastError?: Error;
  lastConnectedAt?: Date;
  messageCount: number;
}

export interface MultiConnectionManagerOptions {
  maxReconnectAttempts?: number;
  initialReconnectDelay?: number;
  maxReconnectDelay?: number;
  connectionTimeout?: number;
  healthCheckInterval?: number;
}

/**
 * 여러 Iris 서버에 동시에 연결을 관리하는 클래스
 */
export class MultiConnectionManager {
  private connections: Map<string, ConnectionState> = new Map();
  private logger: Logger;
  private options: Required<MultiConnectionManagerOptions>;
  private onMessageCallback?: (
    data: IrisRequest,
    connectionId: string
  ) => Promise<void>;
  private healthCheckTimer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(logger: Logger, options: MultiConnectionManagerOptions = {}) {
    this.logger = logger;
    this.options = {
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      initialReconnectDelay: options.initialReconnectDelay ?? 1000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30000,
      connectionTimeout: options.connectionTimeout ?? 10000,
      healthCheckInterval: options.healthCheckInterval ?? 30000,
    };
  }

  /**
   * 연결 설정 추가
   */
  addConnection(config: ConnectionConfig): void {
    const cleanUrl = this.cleanUrl(config.url);
    const api = new IrisAPI(`http://${cleanUrl}`);

    this.connections.set(config.id, {
      id: config.id,
      url: cleanUrl,
      status: 'disconnected',
      api,
      reconnectAttempts: 0,
      messageCount: 0,
    });

    this.logger.info(`Connection added: ${config.id} -> ${cleanUrl}`);
  }

  /**
   * 여러 연결 설정 한 번에 추가
   */
  addConnections(configs: ConnectionConfig[]): void {
    for (const config of configs) {
      if (config.enabled !== false) {
        this.addConnection(config);
      }
    }
  }

  /**
   * URL 정리
   */
  private cleanUrl(url: string): string {
    return url
      .replace(/^https?:\/\//, '')
      .replace(/^wss?:\/\//, '')
      .replace(/\/$/, '');
  }

  /**
   * 메시지 핸들러 설정
   */
  setMessageHandler(
    callback: (data: IrisRequest, connectionId: string) => Promise<void>
  ): void {
    this.onMessageCallback = callback;
  }

  /**
   * 특정 연결의 봇 ID 가져오기
   */
  getBotId(connectionId?: string): string | undefined {
    if (connectionId) {
      return this.connections.get(connectionId)?.botId;
    }
    // 첫 번째 연결된 봇 ID 반환
    for (const conn of this.connections.values()) {
      if (conn.botId) return conn.botId;
    }
    return undefined;
  }

  /**
   * 특정 연결의 API 인스턴스 가져오기
   */
  getApi(connectionId?: string): IrisAPI | undefined {
    if (connectionId) {
      return this.connections.get(connectionId)?.api;
    }
    // 첫 번째 연결된 API 반환
    for (const conn of this.connections.values()) {
      if (conn.status === 'connected') return conn.api;
    }
    // 연결된 것이 없으면 첫 번째 API 반환
    const firstConn = this.connections.values().next().value;
    return firstConn?.api;
  }

  /**
   * 모든 연결 시작
   */
  async connectAll(): Promise<void> {
    this.isRunning = true;
    const connectionPromises: Promise<void>[] = [];

    for (const [id, state] of this.connections) {
      connectionPromises.push(this.connectWithRetry(id));
    }

    // 모든 연결 시도를 병렬로 시작 (하나가 실패해도 다른 연결은 계속)
    await Promise.allSettled(connectionPromises);

    // 헬스 체크 시작
    this.startHealthCheck();
  }

  /**
   * 단일 연결 (재시도 포함)
   */
  private async connectWithRetry(connectionId: string): Promise<void> {
    const state = this.connections.get(connectionId);
    if (!state) {
      this.logger.error(`Connection not found: ${connectionId}`);
      return;
    }

    while (this.isRunning) {
      try {
        state.status = 'connecting';
        await this.connect(connectionId);

        // 연결 성공
        state.status = 'connected';
        state.reconnectAttempts = 0;
        state.lastConnectedAt = new Date();

        this.logger.info(`Connection established: ${connectionId}`);

        // 연결이 끊어질 때까지 대기
        await this.waitForDisconnection(connectionId);

        if (!this.isRunning) break;

        state.status = 'reconnecting';
        this.logger.warn(
          `Connection lost: ${connectionId}. Attempting to reconnect...`
        );
      } catch (error) {
        state.lastError = error as Error;
        state.status = 'error';

        this.logger.error(`Connection error for ${connectionId}:`, error);

        if (state.reconnectAttempts >= this.options.maxReconnectAttempts) {
          this.logger.error(
            `Max reconnect attempts reached for ${connectionId}. Connection disabled.`
          );
          state.status = 'disconnected';
          break;
        }

        state.reconnectAttempts++;
        const delay = Math.min(
          this.options.initialReconnectDelay *
            Math.pow(2, state.reconnectAttempts - 1),
          this.options.maxReconnectDelay
        );

        this.logger.info(`Reconnecting ${connectionId} in ${delay}ms...`, {
          attempt: state.reconnectAttempts,
          maxAttempts: this.options.maxReconnectAttempts,
        });

        await this.sleep(delay);
      }
    }
  }

  /**
   * 단일 연결 시도
   */
  private async connect(connectionId: string): Promise<void> {
    const state = this.connections.get(connectionId);
    if (!state) throw new Error(`Connection not found: ${connectionId}`);

    return new Promise((resolve, reject) => {
      const wsEndpoint = `ws://${state.url}/ws`;
      const ws = new WebSocket(wsEndpoint);
      state.ws = ws;

      const connectTimeout = setTimeout(() => {
        ws.close();
        reject(new Error(`Connection timed out: ${connectionId}`));
      }, this.options.connectionTimeout);

      ws.on('open', async () => {
        clearTimeout(connectTimeout);
        this.logger.debug(`WebSocket opened: ${connectionId}`);

        try {
          const info = await state.api.getInfo();
          state.botId = String(info.bot_id);
          this.logger.info(
            `Bot ID retrieved for ${connectionId}: ${state.botId}`
          );
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(connectionId, data);
      });

      ws.on('error', (error: Error) => {
        clearTimeout(connectTimeout);
        this.logger.error(`WebSocket error for ${connectionId}:`, error);
        reject(error);
      });

      ws.on('close', (code, reason) => {
        clearTimeout(connectTimeout);
        this.logger.debug(
          `WebSocket closed for ${connectionId}: ${code} - ${reason}`
        );
        state.ws = undefined;
      });
    });
  }

  /**
   * 메시지 처리
   */
  private handleMessage(connectionId: string, data: WebSocket.Data): void {
    const state = this.connections.get(connectionId);
    if (!state) return;

    try {
      const recv = data.toString();
      const rawData = safeJsonParseWithReviver(recv);

      // Python 구현과 유사하게 데이터 재구성
      const processedData = {
        ...rawData,
        raw: rawData.json,
        _connectionId: connectionId, // 연결 ID 추가
      };
      delete processedData.json;

      state.messageCount++;

      if (this.onMessageCallback) {
        // 비동기로 처리하되 에러 핸들링
        this.onMessageCallback(
          processedData as IrisRequest,
          connectionId
        ).catch((error) => {
          this.logger.error(
            `Error processing message from ${connectionId}:`,
            error
          );
        });
      }
    } catch (error) {
      this.logger.error(`Error parsing message from ${connectionId}:`, error);
    }
  }

  /**
   * 연결 끊김 대기
   */
  private async waitForDisconnection(connectionId: string): Promise<void> {
    const state = this.connections.get(connectionId);
    if (!state?.ws) return;

    return new Promise((resolve) => {
      if (!state.ws) {
        resolve();
        return;
      }

      state.ws.once('close', () => {
        resolve();
      });
    });
  }

  /**
   * 헬스 체크 시작
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.options.healthCheckInterval);
  }

  /**
   * 헬스 체크 수행
   */
  private async performHealthCheck(): Promise<void> {
    for (const [id, state] of this.connections) {
      if (state.status === 'disconnected' || state.status === 'error') {
        // 연결이 끊어진 연결 재시도
        if (state.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.logger.info(`Health check: Attempting to reconnect ${id}`);
          state.reconnectAttempts = 0; // 헬스 체크에서는 재시도 횟수 리셋
          this.connectWithRetry(id);
        }
      } else if (state.status === 'connected' && state.ws) {
        // 연결 상태 확인 (ping)
        try {
          state.ws.ping();
        } catch (error) {
          this.logger.warn(`Health check ping failed for ${id}:`, error);
        }
      }
    }
  }

  /**
   * 모든 연결 상태 가져오기
   */
  getConnectionStates(): Map<string, ConnectionState> {
    return new Map(this.connections);
  }

  /**
   * 연결 통계 가져오기
   */
  getStats(): {
    total: number;
    connected: number;
    disconnected: number;
    error: number;
    totalMessages: number;
  } {
    let connected = 0;
    let disconnected = 0;
    let error = 0;
    let totalMessages = 0;

    for (const state of this.connections.values()) {
      totalMessages += state.messageCount;
      switch (state.status) {
        case 'connected':
          connected++;
          break;
        case 'disconnected':
          disconnected++;
          break;
        case 'error':
          error++;
          break;
      }
    }

    return {
      total: this.connections.size,
      connected,
      disconnected,
      error,
      totalMessages,
    };
  }

  /**
   * WebSocket 없이 봇 정보 초기화 (HTTP 모드용)
   */
  async initializeBotInfo(): Promise<void> {
    for (const [id, state] of this.connections) {
      try {
        const info = await state.api.getInfo();
        state.botId = String(info.bot_id);
        this.logger.info(`Bot ID initialized for ${id}: ${state.botId}`);
      } catch (error) {
        this.logger.error(`Failed to get bot info for ${id}:`, error);
      }
    }
  }

  /**
   * 모든 연결 종료
   */
  close(): void {
    this.isRunning = false;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    for (const [id, state] of this.connections) {
      if (state.ws) {
        state.ws.close();
        state.ws = undefined;
      }
      state.status = 'disconnected';
    }

    this.logger.info('All connections closed');
  }

  /**
   * 특정 연결 종료
   */
  closeConnection(connectionId: string): void {
    const state = this.connections.get(connectionId);
    if (state) {
      if (state.ws) {
        state.ws.close();
        state.ws = undefined;
      }
      state.status = 'disconnected';
      this.logger.info(`Connection closed: ${connectionId}`);
    }
  }

  /**
   * 특정 연결 재시작
   */
  async restartConnection(connectionId: string): Promise<void> {
    const state = this.connections.get(connectionId);
    if (state) {
      this.closeConnection(connectionId);
      state.reconnectAttempts = 0;
      await this.connectWithRetry(connectionId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
