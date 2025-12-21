# node-iris

node-iris는 Python으로 작성된 [irispy-client](https://github.com/dolidolih/irispy-client) 모듈의 Node.js(TypeScript) 포팅 버전입니다. 카카오톡 봇 개발을 위한 기능을 제공합니다.

## 주요 기능

- 🔌 **다중 WebSocket 연결**: 여러 Iris 서버에 동시 연결 지원
- 📨 **메시지 큐 시스템**: 명령어 씹힘 방지 및 병렬 메시지 처리
- ⚡ **병렬 이벤트 처리**: 이벤트 핸들러 동시 실행으로 처리 속도 향상
- 🎯 **데코레이터 기반 개발**: 컨트롤러 패턴으로 체계적인 봇 개발
- 📅 **배치 및 스케줄링**: 예약 메시지 및 주기적 작업 지원

## 설치

```bash
npm install @syncate-core/node-iris
# 또는
pnpm install @syncate-core/node-iris
```

## 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음과 같이 설정하세요:

```env
# Iris URL (IP:PORT 형식)
IRIS_URL=127.0.0.1:3000

# 최대 워커 스레드 수 (선택사항)
MAX_WORKERS=4

# 차단된 사용자 ID 목록 (쉼표로 구분, 선택사항)
BANNED_USERS=123456789,987654321

# 카카오 앱 키 (선택사항)
KAKAOLINK_APP_KEY=your_kakao_app_key

# 카카오 앱 사이트 도메인 (선택사항)
KAKAOLINK_ORIGIN=your_origin
```

## 기본 사용법

### 봇 생성 및 실행

```typescript
import { Bot, ChatContext } from '@syncate-core/node-iris';

const bot = new Bot('BotName', process.env.IRIS_URL, { maxWorkers: 4 });

// 메시지 이벤트 핸들러
bot.on('message', async (context: ChatContext) => {
  if (context.message.command === '안녕') {
    await context.reply('안녕하세요!');
  }
});

// 봇 시작
await bot.run();
```

### 다중 연결 및 메시지 큐 (v1.6.50+)

명령어 씹힘 문제를 해결하고 여러 서버에 동시 연결하려면:

```typescript
const bot = new Bot('BotName', process.env.IRIS_URL, {
  // 다중 연결 모드
  multiConnection: true,
  connections: [{ id: 'server2', url: '192.168.1.101:3000' }],

  // 메시지 큐 (기본 활성화)
  useMessageQueue: true,
  messageQueueOptions: {
    maxConcurrent: 15, // 동시 처리 메시지 수
    maxQueueSize: 500, // 최대 큐 크기
  },

  // 병렬 이벤트 처리 (기본 활성화)
  parallelEventHandling: true,
});
```

자세한 내용은 [다중 연결 가이드](docs/MULTI_CONNECTION.md)를 참조하세요.

### 이벤트 종류

- `chat`: 모든 메시지
- `message`: 일반 메시지
- `new_member`: 새 멤버 참여
- `del_member`: 멤버 퇴장
- `unknown`: 알 수 없는 이벤트
- `error`: 오류 발생

### 컨트롤러 기반 개발 (권장)

더 체계적인 봇 개발을 위해 컨트롤러 기반 방식을 권장합니다:

```typescript
import {
  Bot,
  MessageController,
  BotCommand,
  ChatContext,
} from '@syncate-core/node-iris';

@MessageController
export default class MyMessageController {
  @BotCommand('안녕', '인사 명령어')
  async hello(context: ChatContext) {
    await context.reply('안녕하세요!');
  }

  @BotCommand('도움말', '도움말 표시')
  async help(context: ChatContext) {
    await context.reply('사용 가능한 명령어: 안녕, 도움말');
  }
}
```

### 사용 가능한 데코레이터

#### 클래스 데코레이터

- `@BootstrapController`: 봇 앱 시작시 우선적으로 실행
- `@BatchController`: 스케줄, 배치 처리
- `@ChatController`, `@Controller`: 모든 채팅 이벤트 처리
- `@MessageController`: 메시지 이벤트 처리
- `@NewMemberController`: 새 멤버 입장 이벤트 처리
- `@DeleteMemberController`: 멤버 퇴장 이벤트 처리
- `@FeedController`: 피드 이벤트 처리
- `@UnknownController`: 알 수 없는 명령어 처리
- `@ErrorController`: 에러 이벤트 처리

#### 메소드 데코레이터

**기본 명령어 데코레이터:**

- `@BotCommand('명령어', '설명')`: 봇 명령어 등록
- `@Command`: 컨트롤러에 이벤트가 수신된 경우 자동으로 실행되는 명령어로 등록
- `@HelpCommand('도움말')`: 도움말 명령어 등록

**Prefix 및 스케줄링 데코레이터:**

- `@Prefix('!')`: 컨트롤러의 기본 prefix 설정
- `@MethodPrefix('특정메소드!')`: 특정 메소드에만 prefix 설정
- `@Schedule(5000)`: 주기적 스케줄 실행 (밀리초)
- `@ScheduleMessage('key')`: 스케줄된 메시지 처리
- `@Bootstrap(1)`: 봇 시작시 부트스트랩 실행 (낮은 숫자 우선)

**메시지 타입별 데코레이터:**

- `@OnMessage`: 모든 메시지에 반응
- `@OnNormalMessage`: 일반 텍스트 메시지에만 반응
- `@OnPhotoMessage`: 사진 메시지에만 반응
- `@OnImageMessage`: 이미지 메시지에만 반응
- `@OnVideoMessage`: 비디오 메시지에만 반응
- `@OnAudioMessage`: 오디오 메시지에만 반응
- `@OnFileMessage`: 파일 메시지에만 반응
- `@OnMapMessage`: 지도 메시지에만 반응
- `@OnEmoticonMessage`: 이모티콘 메시지에만 반응
- `@OnProfileMessage`: 프로필 메시지에만 반응
- `@OnMultiPhotoMessage`: 다중 사진 메시지에만 반응
- `@OnNewMultiPhotoMessage`: 새로운 다중 사진 메시지에만 반응
- `@OnReplyMessage`: 답장 메시지에만 반응

**피드 타입별 데코레이터:**

- `@OnFeedMessage`: 피드 메시지에만 반응
- `@OnInviteUserFeed`: 사용자 초대 피드에 반응
- `@OnLeaveUserFeed`: 사용자 퇴장 피드에 반응
- `@OnDeleteMessageFeed`: 메시지 삭제 피드에 반응
- `@OnHideMessageFeed`: 메시지 숨김 피드에 반응
- `@OnPromoteManagerFeed`: 관리자 승급 피드에 반응
- `@OnDemoteManagerFeed`: 관리자 강등 피드에 반응
- `@OnHandOverHostFeed`: 방장 위임 피드에 반응
- `@OnOpenChatJoinUserFeed`: 오픈채팅 사용자 입장 피드에 반응
- `@OnOpenChatKickedUserFeed`: 오픈채팅 사용자 추방 피드에 반응

**제한 및 조건부 데코레이터:**

- `@Throttle(횟수, 시간)`: 명령어 사용 빈도 제한
- `@HasParam`: 파라미터가 있는 메시지만 처리
- `@IsReply`: 답장 메시지만 처리
- `@IsAdmin`: 관리자만 사용 가능
- `@IsNotBanned`: 차단되지 않은 사용자만 사용 가능
- `@HasRole(['HOST', 'MANAGER'])`: 특정 역할만 사용 가능
- `@AllowedRoom(['room1', 'room2'])`: 특정 방에서만 사용 가능

### 스케줄링과 배치 처리

```typescript
import {
  BatchController,
  Schedule,
  ScheduleMessage,
  Bootstrap,
} from '@syncate-core/node-iris';

@BatchController
export default class MyBatchController {
  // 주기적 실행 (5초마다)
  @Schedule(5000)
  async periodicTask() {
    console.log('주기적 작업 실행 중...');
  }

  // 스케줄된 메시지 처리
  @ScheduleMessage('reminder')
  async handleReminder(scheduledMessage: ScheduledMessage) {
    console.log('리마인더 처리:', scheduledMessage.message);
  }

  // 부트스트랩 (봇 시작시 실행)
  @Bootstrap(1)
  async initializeDatabase() {
    console.log('데이터베이스 초기화 중...');
  }
}
```

### 데코레이터 사용 (함수형)

```typescript
import { decorators } from '@syncate-core/node-iris';

// 파라미터가 있는 경우에만 실행
const echoHandler = decorators.hasParam(async (context: ChatContext) => {
  await context.reply(`에코: ${context.message.param}`);
});

// 관리자만 실행 가능
const adminHandler = decorators.isAdmin(async (context: ChatContext) => {
  await context.reply('관리자 명령어입니다.');
});

// 답장인 경우에만 실행
const replyHandler = decorators.isReply(async (context: ChatContext) => {
  await context.reply('답장을 확인했습니다!');
});

// 차단되지 않은 사용자만 실행
const notBannedHandler = decorators.isNotBanned(
  async (context: ChatContext) => {
    await context.reply('실행 가능합니다.');
  }
);
```

### 유틸리티 함수

#### 스케줄링 관련

- `addContextToSchedule(context, delay, key)`: 컨텍스트를 스케줄에 추가
- `scheduleMessage(id, roomId, message, time, metadata)`: 메시지 스케줄링

#### 스로틀링 관리

- `clearUserThrottle(userId, commandName)`: 특정 사용자의 스로틀 해제
- `clearAllThrottle(commandName)`: 모든 사용자의 스로틀 해제

#### 디버깅 및 메타데이터

- `debugDecoratorMetadata()`: 데코레이터 메타데이터 디버깅
- `debugRoomRestrictions()`: 방 제한 설정 디버깅

#### 정보 조회

- `getRegisteredCommands()`: 등록된 명령어 목록 조회
- `getRegisteredControllers()`: 등록된 컨트롤러 목록 조회
- `getBatchControllers()`: 배치 컨트롤러 목록 조회
- `getBootstrapControllers()`: 부트스트랩 컨트롤러 목록 조회

### 카카오링크 사용

```typescript
import {
  IrisLink,
  KakaoLinkException,
  KakaoLinkReceiverNotFoundException,
  KakaoLinkLoginException,
  KakaoLinkSendException,
} from '@syncate-core/node-iris';

const link = new IrisLink(
  process.env.IRIS_URL,
  process.env.KAKAOLINK_APP_KEY,
  process.env.KAKAOLINK_ORIGIN
);

try {
  // 템플릿을 사용한 메시지 전송
  await link.send(
    '내 채팅방', // receiver_name
    12345, // template_id
    { key: 'value' } // template_args
  );
} catch (error) {
  if (error instanceof KakaoLinkSendException) {
    console.error('메시지 전송 실패');
  }
}
```

## API 참조

### Bot 클래스

#### 생성자

```typescript
new Bot(irisUrl: string, options?: BotOptions)
```

**BotOptions:**

```typescript
interface BotOptions {
  maxWorkers?: number;
  httpMode?: boolean;
  port?: number;
  webhookPath?: string;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  errorHandler?: ErrorHandler;
  eventHandler?: EventHandler;
}
```

#### 메서드

- `on(event: string, handler: Function)`: 이벤트 핸들러 등록
- `run(): Promise<void>`: 봇 실행 (비동기)
- `stop(): void`: 봇 중지

### 주요 클래스 및 인터페이스

#### BatchScheduler

배치 작업과 메시지 스케줄링을 관리하는 싱글톤 클래스입니다.

```typescript
import { BatchScheduler } from '@syncate-core/node-iris';

const scheduler = BatchScheduler.getInstance();

// 메시지 스케줄링
scheduler.scheduleMessage(
  'reminder-id',
  'room-id',
  '알림 메시지입니다!',
  Date.now() + 60000, // 1분 후
  { key: 'reminder', type: 'meeting' }
);
```

#### Logger

통합 로깅 시스템을 제공합니다.

```typescript
import { Logger, LogLevel, defaultLogger } from '@syncate-core/node-iris';

// 커스텀 로거 생성
const logger = new Logger(LogLevel.DEBUG);

// 기본 로거 사용
defaultLogger.info('정보 메시지');
defaultLogger.error('에러 메시지');
```

#### Config

환경 설정을 관리하는 클래스입니다.

```typescript
import { Config } from '@syncate-core/node-iris';

const config = new Config();
const irisUrl = config.get('IRIS_URL');
```

#### EventEmitter

이벤트 기반 프로그래밍을 위한 유틸리티입니다.

```typescript
import { EventEmitter } from '@syncate-core/node-iris';

const emitter = new EventEmitter();
emitter.on('custom-event', (data) => {
  console.log('이벤트 수신:', data);
});
```

### ChatContext 클래스

#### 속성

- `room: Room`: 채팅방 정보
- `sender: User`: 발신자 정보
- `message: Message`: 메시지 정보
- `raw: any`: 원시 데이터
- `api: IIrisAPI`: API 인스턴스

#### 메서드

- `reply(message: string, roomId?: string | number): Promise<any>`: 답장 보내기
- `replyMedia(files: Buffer[], roomId?: string | number): Promise<any>`: 미디어 파일 보내기
- `getSource(): Promise<ChatContext | null>`: 답장하는 메시지의 ChatContext 반환
- `getNextChat(n?: number): Promise<ChatContext | null>`: 다음 메시지의 ChatContext 반환
- `getPreviousChat(n?: number): Promise<ChatContext | null>`: 이전 메시지의 ChatContext 반환

### Message 클래스

#### 속성

- `id: string`: 메시지 ID _(Python: int → TypeScript: string)_
- `type: number`: 메시지 타입
- `msg: string`: 메시지 내용
- `attachment: any`: 메시지 첨부 파일
- `v: any`: 추가 메시지 데이터
- `command: string`: 명령어 (첫 번째 단어)
- `param: string`: 매개변수 (나머지 부분)
- `hasParam: boolean`: 매개변수 존재 여부
- `image: ChatImage | null`: 이미지 정보 (있는 경우)

### User 클래스

#### 속성

- `id: string`: 사용자 ID _(Python: int → TypeScript: string)_
- `avatar: Avatar`: 사용자의 Avatar 객체

#### 메서드

- `getName(): Promise<string>`: 사용자 이름 조회 (비동기, 캐시됨)
- `getType(): Promise<string>`: 사용자 권한 조회 (비동기, 캐시됨)

#### 사용자 권한

- `HOST`: 방장
- `MANAGER`: 관리자
- `NORMAL`: 일반 사용자
- `BOT`: 봇

### Room 클래스

#### 속성

- `id: string`: 방 ID _(Python: int → TypeScript: string)_
- `name: string`: 방 이름

#### 메서드

- `getType(): Promise<string>`: 채팅방 타입 조회 (비동기, 캐시됨)

### Avatar 클래스

#### 속성

- `id: string`: 아바타 ID _(Python: int → TypeScript: string)_

#### 메서드

- `getUrl(): Promise<string>`: 아바타 이미지 URL 조회 (비동기, 캐시됨)
- `getImg(): Promise<Buffer>`: 아바타 이미지 데이터 조회 (비동기, 캐시됨)

### ChatImage 클래스

#### 속성

- `url: string[]`: 이미지 URL 목록

#### 메서드

- `getImg(): Promise<Buffer[]>`: 이미지 데이터 목록 조회 (비동기, 캐시됨)

### IrisLink 클래스

#### 생성자

```typescript
new IrisLink(
  irisUrl: string,
  defaultAppKey?: string,
  defaultOrigin?: string
)
```

#### 메서드

- `send(receiverName: string, templateId: number, templateArgs: Record<string, any>, options?: object): Promise<void>`: 템플릿 메시지 전송 (비동기)
- `init(): Promise<void>`: 초기화 및 로그인 (비동기)

#### 예외 클래스

- `KakaoLinkException` / `IrisLinkException`: 일반적인 KakaoLink 오류
- `KakaoLinkReceiverNotFoundException` / `IrisLinkReceiverNotFoundException`: 받는 사람을 찾을 수 없음
- `KakaoLinkLoginException` / `IrisLinkLoginException`: 로그인 관련 오류
- `KakaoLink2FAException` / `IrisLink2FAException`: 2단계 인증 관련 오류
- `KakaoLinkSendException` / `IrisLinkSendException`: 메시지 전송 오류

### BaseController 클래스

모든 컨트롤러의 기본 클래스입니다.

```typescript
import { BaseController, Logger } from '@syncate-core/node-iris';

export default class MyController extends BaseController {
  protected logger: Logger;

  constructor() {
    super();
    this.logger = new Logger();
  }
}
```

## 고급 사용 예제

### 1. 파라미터가 있는 명령어

```typescript
@MessageController
@Prefix('!')
export default class MessageController {
  @BotCommand('반복', '메시지 반복')
  @HasParam
  async echo(context: ChatContext) {
    const message = context.message.param;
    await context.reply(`반복: ${message}`);
  }
}
```

### 2. 관리자 전용 명령어

```typescript
@BotCommand('공지', '공지사항 전송')
@IsAdmin // 또는 @HasRole(['HOST', 'MANAGER'])
@HasParam
async announce(context: ChatContext) {
  const announcement = context.message.param;
  await context.reply(`📢 공지: ${announcement}`);
}
```

### 3. 사용 빈도 제한

```typescript
@BotCommand('날씨', '날씨 정보 조회')
@Throttle(3, 60000) // 1분에 3번만 허용
async weather(context: ChatContext) {
  await context.reply('오늘 날씨는 맑습니다!');
}
```

### 4. 특정 메시지 타입 처리

```typescript
@FeedController
export default class FeedController {
  // 사용자 초대 이벤트
  @OnInviteUserFeed
  async onUserInvite(context: ChatContext) {
    await context.reply('새로운 멤버가 초대되었습니다! 👋');
  }

  // 관리자 승급 이벤트
  @OnPromoteManagerFeed
  async onManagerPromote(context: ChatContext) {
    await context.reply('새로운 관리자가 임명되었습니다! 👑');
  }
}
```

### 5. 방 제한 및 조건부 실행

```typescript
@BotCommand('특별명령', '특정 방에서만 사용 가능한 명령어')
@AllowedRoom(['특별한방', '관리자방'])
async specialCommand(context: ChatContext) {
  await context.reply('이 명령어는 특별한 방에서만 실행됩니다!');
}

@BotCommand('차단확인', '차단되지 않은 사용자만 사용 가능')
@IsNotBanned
async notBannedOnly(context: ChatContext) {
  await context.reply('차단되지 않은 사용자입니다!');
}
```

### 6. 메소드별 다른 Prefix 설정

```typescript
@MessageController
@Prefix('!')
export default class MessageController {
  // 기본 prefix (!) 사용
  @BotCommand('기본명령', '기본 prefix 명령어')
  async defaultCommand(context: ChatContext) {
    await context.reply('기본 명령어입니다!');
  }

  // 특정 메소드에만 다른 prefix 적용
  @BotCommand('특별명령', '특별한 prefix 명령어')
  @MethodPrefix('?')
  async specialPrefixCommand(context: ChatContext) {
    await context.reply('?특별명령 으로 호출됩니다!');
  }
}
```

## 예시

자세한 사용 예시는 `examples/` 폴더를 참조하세요:

- `examples/basic-bot.ts`: 기본 봇 사용법
- `examples/kakaolink-example.ts`: 카카오링크 사용법

## 라이선스

[MIT](https://github.com/Tsuki-Chat/node-iris/LICENSE)

## 참조

- [IrisPy2](https://github.com/ye-seola/IrisPy2) and [kakaolink-py](https://github.com/ye-seola/kakaolink-py) by [@ye-seola](https://github.com/ye-seola)
- [irispy-client](https://github.com/dolidolih/irispy-client) by [@dolidolih](https://github.com/dolidolih)

## 면책 조항

이 프로젝트는 오직 교육 및 연구 목적으로 제공됩니다. 개발자들은 이 소프트웨어의 오용이나 이로 인한 손상에 대해 책임지지 않습니다. 본인의 책임 하에 사용하시고, 관련 법률 및 서비스 약관을 준수하시기 바랍니다.

This project is provided for educational and research purposes only. The developers are not responsible for any misuse or damage caused by this software. Use it at your own risk and ensure you comply with all applicable laws and terms of service.
