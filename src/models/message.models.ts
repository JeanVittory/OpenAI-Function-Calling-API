import OpenAI from 'openai';
import { ApiProperty } from '@nestjs/swagger';

export class MessageDTO {
  @ApiProperty()
  message: string;
}

export type FunctionAIResponse = {
  type: 'function';
  name: string;
  description: string;
  arguments: unknown;
  strict?: boolean;
  call_id: string;
};

export type FinalCall = {
  openai: OpenAI;
  message: string;
  chat: OpenAI.Responses.Response & {
    _request_id?: string | null;
  };
  tool: FunctionAIResponse;
  resultQuery: string;
};
