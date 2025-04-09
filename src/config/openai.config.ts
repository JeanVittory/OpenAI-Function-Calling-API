import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenAIConfig {
  constructor(private configService: ConfigService) {}

  createOpenAIClient() {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const openAIClient = new OpenAI({
      apiKey: apiKey,
    });

    return openAIClient;
  }
}
