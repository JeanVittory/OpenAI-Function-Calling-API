import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AppService } from './app.service';
import { MessageDTO } from './models/message.models';
import { ApiBody } from '@nestjs/swagger';
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Here we use a POST method since I consider that, although a state is not being altered
   * and GET might seem like a better method as it is an idempotent procedure, that is,
   * its response is not predictable, in principle it does not need to be cached since each
   * question changes depending on its context and the response will always be dynamic,
   * it seems more appropriate to use POST as the HTTP protocol verb.
   */
  @Post()
  @ApiBody({ type: MessageDTO })
  openaiRequest(@Body() request: MessageDTO): Promise<string | undefined> {
    // If the request is emty or a message value into the body do not exist will return a bad request response
    if (!request || !request.message)
      throw new BadRequestException('You must to provide a message!');
    return this.appService.callChatGPT(request);
  }
}
