/**
 * node-iris - TypeScript port of Python irispy-client module
 * 다중 WebSocket 연결 및 메시지 큐 지원
 */

// Main classes
import './paths'; // Ensure path aliases are registered
export { Bot } from './services/bot/Bot';
export { BatchScheduler } from './services/core/BatchScheduler';
export { IrisAPI } from './services/core/IrisAPI';
export {
  KakaoLink,
  KakaoLink2FAException,
  KakaoLinkException,
  KakaoLinkLoginException,
  KakaoLinkReceiverNotFoundException,
  KakaoLinkSendException,
} from './services/core/IrisLink';
export { defaultLogger, Logger, LogLevel } from './utils/logger';

// Multi-connection and Message Queue
export { MultiConnectionManager } from './services/bot/MultiConnectionManager';
export { AsyncMessageQueue } from './services/bot/AsyncMessageQueue';
export type {
  ConnectionConfig,
  ConnectionState,
  MultiConnectionManagerOptions,
} from './services/bot/MultiConnectionManager';
export type {
  QueuedMessage,
  MessageQueueOptions,
  MessageQueueStats,
} from './services/bot/AsyncMessageQueue';
export type { ApiResolver } from './services/bot/MessageProcessor';

// Alias for compatibility with Python irispy-client module
export {
  KakaoLink as IrisLink,
  KakaoLink2FAException as IrisLink2FAException,
  KakaoLinkException as IrisLinkException,
  KakaoLinkLoginException as IrisLinkLoginException,
  KakaoLinkReceiverNotFoundException as IrisLinkReceiverNotFoundException,
  KakaoLinkSendException as IrisLinkSendException,
} from './services/core/IrisLink';

// Models
export {
  Avatar,
  ChatContext,
  ChatImage,
  ErrorContext,
  IrisRawData,
  IrisRequest,
  Message,
  Room,
  User,
} from './types/models';

// Controllers
export { BaseController } from './controllers/BaseController';

// Decorators
export {
  addContextToSchedule,
  AllowedRoom,
  // Batch and Bootstrap decorators
  BatchController,
  Bootstrap,
  BootstrapController,
  BotCommand,
  ChatController,
  clearAllThrottle,
  clearUserThrottle,
  Command,
  // Controller class decorators
  ChatController as Controller,
  debugDecoratorMetadata,
  debugRoomRestrictions,
  decorators,
  DeleteMemberController,
  ErrorController,
  FeedController,
  getBatchControllers,
  getBootstrapControllers,
  getBootstrapMethods,
  // Utility functions
  getRegisteredCommands,
  getRegisteredControllers,
  getScheduleMessageMethods,
  getScheduleMethods,
  // Method decorators
  HasParam,
  // Function decorators (backward compatibility)
  hasParam,
  HasRole,
  HelpCommand,
  IsAdmin,
  isAdmin,
  IsNotBanned,
  isNotBanned,
  IsReply,
  isReply,
  MessageController,
  MethodPrefix,
  NewMemberController,
  OnAudioMessage,
  OnDeleteMessageFeed,
  OnDemoteManagerFeed,
  OnEmoticonMessage,
  OnFeedMessage,
  OnFileMessage,
  OnHandOverHostFeed,
  OnHideMessageFeed,
  OnImageMessage,
  // Feed type decorators
  OnInviteUserFeed,
  OnLeaveUserFeed,
  OnMapMessage,
  // Message type decorators
  OnMessage,
  OnMultiPhotoMessage,
  OnNewMultiPhotoMessage,
  OnNormalMessage,
  OnOpenChatJoinUserFeed,
  OnOpenChatKickedUserFeed,
  OnPhotoMessage,
  OnProfileMessage,
  OnPromoteManagerFeed,
  OnReplyMessage,
  OnVideoMessage,
  Prefix,
  Schedule,
  ScheduleMessage,
  scheduleMessage,
  Throttle,
  UnknownController,
} from './decorators';

// Utils
export { Config } from './utils/config';
export { EventEmitter } from './utils/event-emitter';
export type { EventEmitterOptions } from './utils/event-emitter';

// Types
export type {
  BotOptions,
  ErrorHandler,
  EventHandler,
} from './services/bot/Bot';

// Version
export const version = '1.6.54';
export const irispy_client_version = '0.1.6';

// Default export is the Bot class for convenience
import { Bot } from './services/bot/Bot';
export default Bot;
