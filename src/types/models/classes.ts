/**
 * Core classes for node-iris: Room, User, Avatar, ChatContext, ErrorContext
 */

import type { IIrisAPI } from '@/types';
import { idToString, safeJsonParseWithReviver, toSafeId } from '@/utils';
import { Logger } from '@/utils/logger';
import type { IrisRawData, SafeId } from './base';
import { Message } from './message';

export class Room {
  public id: SafeId;
  public name: string;
  private _api: IIrisAPI;
  private _type?: string | null;

  constructor(id: number | string | bigint, name: string, api: IIrisAPI) {
    this.id = toSafeId(id);
    this.name = name;
    this._api = api;
  }

  /**
   * Get ID as string for API compatibility
   */
  getIdAsString(): string {
    return idToString(this.id);
  }

  /**
   * Get ID as BigInt for numeric operations
   */
  getIdAsBigInt(): bigint {
    return this.id;
  }

  async getType(): Promise<string | null> {
    if (this._type !== undefined) {
      return this._type as string | null;
    }

    try {
      const results = await this._api.query(
        'SELECT type FROM chat_rooms WHERE id = ?',
        [this.getIdAsString()]
      );

      if (results && results[0]) {
        this._type = results[0].type;
        return this._type as string | null;
      }

      this._type = null;
      return null;
    } catch (error) {
      this._type = null;
      return null;
    }
  }

  toString(): string {
    return `Room(id=${this.getIdAsString()}, name=${this.name})`;
  }
}

export class Avatar {
  private logger: Logger = new Logger('Avatar');
  private _id: SafeId;
  private _chatId: SafeId;
  private _api: IIrisAPI;
  private _url?: string | null;
  private _img?: Buffer | null;

  constructor(
    id: number | string | bigint,
    chatId: number | string | bigint,
    api: IIrisAPI
  ) {
    this._id = toSafeId(id);
    this._chatId = toSafeId(chatId);
    this._api = api;
  }

  getIdAsString(): string {
    return idToString(this._id);
  }

  getChatIdAsString(): string {
    return idToString(this._chatId);
  }

  getIdAsBigInt(): bigint {
    return this._id;
  }

  async getUrl(): Promise<string | null> {
    if (this._url !== undefined) {
      return this._url as string | null;
    }

    try {
      let results: any[];

      if (this.getIdAsBigInt() < 10000000000n) {
        results = await this._api.query(
          'SELECT T2.o_profile_image_url FROM chat_rooms AS T1 JOIN db2.open_profile AS T2 ON T1.link_id = T2.link_id WHERE T1.id = ?',
          [this.getChatIdAsString()]
        );
        this._url = results[0]?.o_profile_image_url || null;
      } else {
        results = await this._api.query(
          'SELECT original_profile_image_url, enc FROM db2.open_chat_member WHERE user_id = ?',
          [this.getIdAsString()]
        );
        this._url = results[0]?.original_profile_image_url || null;
      }

      return this._url as string | null;
    } catch (error) {
      this._url = null;
      return null;
    }
  }

  async getImg(): Promise<Buffer | null> {
    if (this._img !== undefined) {
      return this._img;
    }

    const url = await this.getUrl();

    if (!url) {
      this._img = null;
      return null;
    }

    try {
      const axios = require('axios');
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; node-iris)' },
      });
      this._img = Buffer.from(response.data);
      return this._img;
    } catch (error) {
      this.logger.error('Failed to load avatar image:', error);
      this._img = null;
      return null;
    }
  }

  toString(): string {
    return `Avatar(url=${this._url})`;
  }
}

export class User {
  public id: SafeId;
  public avatar: Avatar;
  private _chatId: SafeId;
  private _api: IIrisAPI;
  private _name?: string | null;
  private _botId?: SafeId;
  private _type?: string | null;

  constructor(
    id: number | string | bigint,
    chatId: number | string | bigint,
    api: IIrisAPI,
    name?: string,
    botId?: number | string | bigint
  ) {
    this.id = toSafeId(id);
    this._chatId = toSafeId(chatId);
    this._api = api;
    this._name = name;
    this._botId = botId ? toSafeId(botId) : undefined;
    this.avatar = new Avatar(this.id, this._chatId, api);
  }

  getIdAsString(): string {
    return idToString(this.id);
  }

  getChatIdAsString(): string {
    return idToString(this._chatId);
  }

  getIdAsBigInt(): bigint {
    return this.id;
  }

  async getName(): Promise<string | null> {
    if (this._name !== undefined) {
      return this._name as string | null;
    }

    try {
      let results: any[];

      if (this.id === this._botId) {
        results = await this._api.query(
          'SELECT T2.nickname FROM chat_rooms AS T1 JOIN db2.open_profile AS T2 ON T1.link_id = T2.link_id WHERE T1.id = ?',
          [this._chatId]
        );
        this._name = results[0]?.nickname || null;
      } else if (BigInt(this.id) < 10000000000n) {
        results = await this._api.query(
          'SELECT name, enc FROM db2.friends WHERE id = ?',
          [this.id]
        );
        this._name = results[0]?.name || null;
      } else {
        results = await this._api.query(
          'SELECT nickname, enc FROM db2.open_chat_member WHERE user_id = ?',
          [this.id]
        );
        this._name = results[0]?.nickname || null;
      }

      return this._name as string | null;
    } catch (error) {
      this._name = null;
      return null;
    }
  }

  async getType(): Promise<string | null> {
    if (this._type !== undefined) {
      return this._type;
    }

    try {
      let results: any[];

      if (this.id === this._botId) {
        results = await this._api.query(
          'SELECT T2.link_member_type FROM chat_rooms AS T1 INNER JOIN open_profile AS T2 ON T1.link_id = T2.link_id WHERE T1.id = ?',
          [this._chatId]
        );
      } else {
        results = await this._api.query(
          'SELECT link_member_type FROM db2.open_chat_member WHERE user_id = ?',
          [this.id]
        );
      }

      const memberType = parseInt(results[0]?.link_member_type || '0');

      switch (memberType) {
        case 1:
          this._type = 'HOST';
          break;
        case 2:
          this._type = 'NORMAL';
          break;
        case 4:
          this._type = 'MANAGER';
          break;
        case 8:
          this._type = 'BOT';
          break;
        default:
          this._type = 'UNKNOWN';
      }

      return this._type;
    } catch (error) {
      this._type = 'REAL_PROFILE';
      return this._type;
    }
  }

  toString(): string {
    return `User(name=${this._name})`;
  }
}

export class ChatContext {
  private logger: Logger = new Logger('ChatContext');
  public room: Room;
  public sender: User;
  public message: Message;
  public raw: IrisRawData;
  public api: IIrisAPI;

  /**
   * Connection ID for multi-connection support
   * Identifies which WebSocket connection this message came from
   */
  public connectionId?: string;

  constructor(
    room: Room,
    sender: User,
    message: Message,
    raw: IrisRawData,
    api: IIrisAPI,
    connectionId?: string
  ) {
    this.room = room;
    this.sender = sender;
    this.message = message;
    this.raw = raw;
    this.api = api;
    this.connectionId = connectionId;
  }

  async reply(message: string, roomId?: string | number): Promise<void> {
    const targetRoomId = roomId || this.room.id;
    const roomIdString =
      typeof targetRoomId === 'string' || typeof targetRoomId === 'number'
        ? idToString(targetRoomId)
        : this.room.getIdAsString();
    await this.api.reply(roomIdString, message);
  }

  async replyMedia(files: Buffer[], roomId?: string | number): Promise<void> {
    const targetRoomId = roomId || this.room.id;
    const roomIdString =
      typeof targetRoomId === 'string' || typeof targetRoomId === 'number'
        ? idToString(targetRoomId)
        : this.room.getIdAsString();
    await this.api.replyMedia(roomIdString, files);
  }

  /**
   * Reply with images from URLs - automatically downloads and converts to base64
   * @param imageUrls - Array of image URLs to download and send
   * @param roomId - Optional room ID (defaults to current room)
   */
  async replyImageUrls(
    imageUrls: string[],
    roomId?: string | number
  ): Promise<void> {
    const targetRoomId = roomId || this.room.id;
    // Temporary cast until interface is updated
    await (this.api as any).replyImageUrls(targetRoomId, imageUrls);
  }

  /**
   * Reply with a single image from URL
   * @param imageUrl - Image URL to download and send
   * @param roomId - Optional room ID (defaults to current room)
   */
  async replyImageUrl(
    imageUrl: string,
    roomId?: string | number
  ): Promise<void> {
    const targetRoomId = roomId || this.room.id;
    // Temporary cast until interface is updated
    await (this.api as any).replyImageUrl(targetRoomId, imageUrl);
  }

  async getSource(): Promise<ChatContext | null> {
    // Check if this message is a reply
    const replyData = this.raw.attachment?.reply;
    if (!replyData) {
      return null;
    }

    try {
      // Get the source message from the API
      const sourceMessage = await this.api.query(
        'SELECT * FROM messages WHERE id = ? AND chat_id = ?',
        [replyData.src_logId, this.room.id]
      );

      if (!sourceMessage || sourceMessage.length === 0) {
        return null;
      }

      // Create ChatContext for source message
      const source = sourceMessage[0];
      const sourceRoom = new Room(this.room.id, this.room.name, this.api);
      const sourceUser = new User(
        source.user_id, // parseInt 제거
        this.room.id,
        this.api,
        source.sender_name
      );
      const sourceMsg = new Message(
        source.id, // parseInt 제거
        parseInt(source.type),
        source.message,
        source.attachment,
        safeJsonParseWithReviver(source.v || '{}')
      );

      return new ChatContext(
        sourceRoom,
        sourceUser,
        sourceMsg,
        source,
        this.api
      );
    } catch (error) {
      this.logger.error('Failed to get source message:', error);
      return null;
    }
  }

  async getNextChat(n: number = 1): Promise<ChatContext | null> {
    try {
      const nextMessages = await this.api.query(
        'SELECT * FROM messages WHERE chat_id = ? AND id > ? ORDER BY id ASC LIMIT ?',
        [this.room.id, this.message.id, n]
      );

      if (!nextMessages || nextMessages.length === 0) {
        return null;
      }

      const next = nextMessages[n - 1] || nextMessages[nextMessages.length - 1];
      const nextRoom = new Room(this.room.id, this.room.name, this.api);
      const nextUser = new User(
        next.user_id, // parseInt 제거
        this.room.id,
        this.api,
        next.sender_name
      );
      const nextMsg = new Message(
        next.id, // parseInt 제거
        parseInt(next.type),
        next.message,
        next.attachment,
        safeJsonParseWithReviver(next.v || '{}')
      );

      return new ChatContext(nextRoom, nextUser, nextMsg, next, this.api);
    } catch (error) {
      this.logger.error('Failed to get next chat:', error);
      return null;
    }
  }

  async getPreviousChat(n: number = 1): Promise<ChatContext | null> {
    try {
      const prevMessages = await this.api.query(
        'SELECT * FROM messages WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?',
        [this.room.id, this.message.id, n]
      );

      if (!prevMessages || prevMessages.length === 0) {
        return null;
      }

      const prev = prevMessages[n - 1] || prevMessages[prevMessages.length - 1];
      const prevRoom = new Room(this.room.id, this.room.name, this.api);
      const prevUser = new User(
        prev.user_id, // parseInt 제거
        this.room.id,
        this.api,
        prev.sender_name
      );
      const prevMsg = new Message(
        prev.id, // parseInt 제거
        parseInt(prev.type),
        prev.message,
        prev.attachment,
        safeJsonParseWithReviver(prev.v || '{}')
      );

      return new ChatContext(prevRoom, prevUser, prevMsg, prev, this.api);
    } catch (error) {
      this.logger.error('Failed to get previous chat:', error);
      return null;
    }
  }
}

export class ErrorContext {
  public event: string;
  public func: Function;
  public exception: Error;
  public args: any[];

  constructor(event: string, func: Function, exception: Error, args: any[]) {
    this.event = event;
    this.func = func;
    this.exception = exception;
    this.args = args;
  }

  toString(): string {
    return `ErrorContext(event=${this.event}, error=${this.exception.message})`;
  }
}
