import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AppService } from './app.service';
import { MessageDTO } from './models/message.models';
import { ApiBody } from '@nestjs/swagger';
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post()
  @ApiBody({ type: MessageDTO })
  openaiRequest(@Body() request: MessageDTO): Promise<string | undefined> {
    // If the request is emty or a message value into the body do not exist will return a bad request response
    if (!request || !request.message)
      throw new BadRequestException('You must to provide a message!');
    return this.appService.callChatGPT(request);
  }
}
