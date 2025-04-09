import { FunctionTool } from 'openai/resources/responses/responses';

export const tools: FunctionTool[] = [
  {
    type: 'function',
    name: 'searchProducts',
    description: 'Search releated products from product list',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'convertCurrencies',
    description: 'Convert currencies using external API',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
      required: ['amount', 'from', 'to'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'searchGifts',
    description:
      'Find relevant products intended as gifts, taking into account the type of occasion (such as a special day or celebration) and the recipient’s gender or age group (men, women, or baby).',
    parameters: {
      type: 'object',
      properties: {
        gender: {
          type: 'string',
          description: 'Gender to filter products by',
          enum: ['men', 'women', 'baby'],
        },
      },
      required: ['gender'],
      additionalProperties: false,
    },
    strict: true,
  },
];
