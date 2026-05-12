import {
  BadRequestException,
  Body,
  Controller,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/user.decorator";
import { ChatService } from "./chat.service";
import { ChatRequestDto, TtsRequestDto } from "./dto/chat.dto";

@Controller("chat")
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly service: ChatService) {}

  @Post()
  async chat(@CurrentUser() user: { id: string }, @Body() body: ChatRequestDto) {
    return this.service.chatText(user.id, body);
  }

  @Post("tts")
  async tts(@Body() body: TtsRequestDto) {
    const buf = await this.service.synthesizeTts(body.text, body.lang);
    return new StreamableFile(buf, { type: "audio/mpeg" });
  }

  @Post("voice")
  @UseInterceptors(FileInterceptor("file"))
  async voice(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
    @Body("threadId") threadId?: string
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("file required");
    }
    return this.service.chatVoice(user.id, file, threadId);
  }

  @Post("image")
  @UseInterceptors(FileInterceptor("file"))
  async image(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
    @Body("message") message?: string,
    @Body("threadId") threadId?: string
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("file required");
    }
    return this.service.chatImage(user.id, file, message, threadId);
  }
}
