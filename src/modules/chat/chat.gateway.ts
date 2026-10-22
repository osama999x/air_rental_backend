import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtCustomService } from '../../common/providers/jwt.service';
import { ChatService } from './chat.service';

@WebSocketGateway({ namespace: '/chat', cors: { origin: true } })
export class ChatGateway {
  @WebSocketServer() server: Server;

  constructor(
    private readonly jwt: JwtCustomService,
    private readonly chat: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const header = client.handshake.auth?.token || client.handshake.headers.authorization;
      const token = String(header || '').replace('Bearer ', '');
      const payload = await this.jwt.verifyAccess(token);
      if (payload.aud && payload.aud !== 'user') throw new Error('user token required');
      client.data.userId = payload.sub;
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { threadId: string }) {
    await this.chat.assertMember(client.data.userId, body.threadId);
    client.join(body.threadId);
    return { joined: body.threadId };
  }

  @SubscribeMessage('message')
  async message(@ConnectedSocket() client: Socket, @MessageBody() body: { threadId: string; body: string }) {
    const saved = await this.chat.send(client.data.userId, body.threadId, body.body);
    this.server.to(body.threadId).emit('message', saved);
    return saved;
  }
}
