import { Injectable } from '@nestjs/common';
import {
  FinalCall,
  FunctionAIResponse,
  MessageDTO,
} from './models/message.models';
import { OpenAIConfig } from './config/openai.config';
import { ExtractPriceFromDB, Product } from './models/product.models';
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';
import { Parameters } from './models/parameters,models';
import { ConfigService } from '@nestjs/config';
import { tools } from './config/tools.config';
import OpenAI from 'openai';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AppService {
  constructor(
    private openAIConfig: OpenAIConfig,
    private configService: ConfigService,
    private httpService: HttpService,
  ) {}

  /**
   * This method executes `convertCurrencies` and `searchProducts` in a chain
   * when the user needs to perform currency conversion for a specific product.
   */
  async executeChainedFlow(
    functions: string[],
    query: string,
    requiredCurrency: string,
  ): Promise<string> {
    let currentProduct: ExtractPriceFromDB[] | undefined;
    const currentCurrency = 'USD';

    for (const func of functions) {
      if (func === 'searchProducts') {
        currentProduct = await this.extractPriceFromText(query);
      } else if (func === 'convertCurrencies') {
        if (currentProduct) {
          let message = '';

          for (const product of currentProduct) {
            const result = await this.getPlainRateAndCurrencies(
              product.amount,
              currentCurrency,
              requiredCurrency,
            );

            message += `The price of ${product.productName} is approximately USD ${product.amount}, which is equivalent to ${result} in ${requiredCurrency}.\n`;
          }

          return message.trim();
        } else {
          return 'Could not extract amount to convert.';
        }
      }
    }
    return '';
  }

  async callChatGPT({ message }: MessageDTO): Promise<string | undefined> {
    try {
      // We instance the OpenAI client
      const openai = this.openAIConfig.createOpenAIClient();

      const chat = await this.generateFunctionCallResponse(openai, message);

      // Extract the function tool information to validate function names and parameters
      const tool = chat.output[0] as unknown as FunctionAIResponse;

      // Determine if we need to run one or multiple functions
      const requiredFunctions = await this.detectRequiredFunctions(message);

      const functionParameters: Parameters = JSON.parse(
        tool.arguments as string,
      );
      let resultQuery: string = '';

      // This path is executed when a chained flow needs to be run
      if (
        requiredFunctions.includes('searchProducts') &&
        requiredFunctions.includes('convertCurrencies')
      ) {
        const requiredCurrency = await this.detectRequiredCurrency(message);
        resultQuery = await this.executeChainedFlow(
          requiredFunctions,
          functionParameters.query,
          requiredCurrency as string,
        );

        // Final response sent to the controller
        return resultQuery;
      }

      // This path runs when the user prompt needs only one function to be executed
      if (tool) {
        const functionName = tool.name;

        if (functionName === 'searchProducts') {
          resultQuery = await this.searchProducts(functionParameters.query);
        }
        if (functionName === 'convertCurrencies') {
          resultQuery = await this.convertCurrencies(
            functionParameters.amount,
            functionParameters.from,
            functionParameters.to,
          );
        }
        if (functionName === 'searchGifts') {
          resultQuery = await this.searchGifts(functionParameters.gender);
        }
        const finalModelResponse =
          await this.generateFinalResponseWithToolOutput({
            openai,
            message,
            chat,
            tool,
            resultQuery,
          });

        // Final response sent to the controller
        return finalModelResponse.output_text;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * This method allows retrieving products based on the query value
   * from the prompt and runs only when the user is looking for gift suggestions.
   */

  async searchGifts(query: string) {
    const filePath = path.join(process.cwd(), 'src/db/productsCSV.csv');
    const csvData = await new Promise<Product[]>((resolve) => {
      const data: Product[] = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: Product) => {
          const regex = new RegExp(`\\b${query.toLowerCase()}\\b`, 'i');
          if (
            regex.test(row.displayTitle.toLowerCase()) ||
            regex.test(row.embeddingText.toLowerCase())
          ) {
            data.push(row);
          }
        })
        .on('end', () => resolve(data));
    });
    const result = csvData.slice(0, 2);
    const formattedPrompt = this.formatProductsToPrompt(result);
    return formattedPrompt;
  }

  /**
   * Sets up the system context with an initial prompt, defines the model, temperature,
   * and token limit, and handles potential errors during the API call.
   */
  private async generateFunctionCallResponse(openai: OpenAI, message: string) {
    try {
      return await openai.responses.create({
        model: this.configService.get('MODEL') as string,
        max_output_tokens: +this.configService.get('MAX_OUTPUT_TOKENS'),
        temperature: +this.configService.get('MODEL_TEMPERATURE'),
        input: [
          {
            role: 'system',
            content: `
              You are an assistant that helps users interact with a product catalog and convert currencies.
              Use the appropriate function based on user input:
              - Use 'searchProducts' to find products based on queries.
              - Use 'convertCurrencies' to convert amounts between currencies.
            `,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        tools,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generates the final OpenAI response by combining the user's message,
   * previous chat output, and the result of a tool call.
   */
  private async generateFinalResponseWithToolOutput({
    openai,
    message,
    chat,
    tool,
    resultQuery,
  }: FinalCall) {
    try {
      return await openai.responses.create({
        model: 'gpt-3.5-turbo',
        max_output_tokens: 100,
        input: [
          {
            role: 'user',
            content: message,
          },
          chat.output[0],
          {
            type: 'function_call_output',
            call_id: tool.call_id,
            output: resultQuery.toString(),
          },
        ],
        tools,
        store: true,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * This method reads a CSV file and retrieves the first two products
   * that contain the query value in either the display title or the embedding text,
   * in order to return products that match the user's prompt.
   */
  private async searchProducts(query: string): Promise<string> {
    const filePath = path.join(process.cwd(), 'src/db/productsCSV.csv');
    const csvData = await new Promise<Product[]>((resolve) => {
      const data: Product[] = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: Product) => {
          if (
            row.displayTitle.toLowerCase().includes(query.toLowerCase()) ||
            row.embeddingText.toLowerCase().includes(query.toLowerCase())
          ) {
            data.push(row);
          }
        })
        .on('end', () => resolve(data));
    });
    const result = csvData.slice(0, 2);
    const formattedPrompt = this.formatProductsToPrompt(result);
    return formattedPrompt;
  }

  private formatProductsToPrompt(products: Product[]): string {
    if (!products.length) return 'No matching products found.';

    let prompt = 'Here are the matching products:\n\n';

    products.forEach((product, index) => {
      prompt += `${index + 1}. **${product.displayTitle}** costs ${product.price}. Description: ${product.embeddingText}.\n`;
    });

    return prompt.trim();
  }

  /**
   * Converts a given amount from one currency to another using real-time exchange rates
   * retrieved from an external API. Returns a formatted string with the result of the conversion.
   */

  async convertCurrencies(amount: number, from: string, to: string) {
    const response$ = this.httpService.get(
      this.configService.get('EXCHANGE_URL') as string,
      {
        params: {
          app_id: this.configService.get('EXCHANGE_API_KEY') as string,
        },
      },
    );

    const response = await firstValueFrom(response$);

    const rates = response.data.rates;

    const fromRate = rates[from.toUpperCase()];
    const toRate = rates[to.toUpperCase()];

    if (!fromRate || !toRate) {
      return `Exchange rate not found ${from} o ${to}`;
    }
    const converted = (amount / fromRate) * toRate;

    return `Conversion successful: ${amount} ${from.toUpperCase()} is equivalent to ${converted.toFixed(2)} ${to.toUpperCase()} at the current exchange rate.`;
  }

  /**
   * This method allows retrieving the converted value
   * from the exchange API in the required currency and
   * just run in the chain flow path
   */
  async getPlainRateAndCurrencies(
    amount: number,
    from: string,
    to: string,
  ): Promise<string | null> {
    const response$ = this.httpService.get(
      this.configService.get('EXCHANGE_URL') as string,
      {
        params: {
          app_id: this.configService.get('EXCHANGE_API_KEY') as string,
        },
      },
    );

    const response = await firstValueFrom(response$);

    const rates = response.data.rates;

    const fromRate = rates[from.toUpperCase()];
    const toRate = rates[to.toUpperCase()];

    if (!fromRate || !toRate) {
      return null;
    }
    const converted = (amount / fromRate) * toRate;

    return converted.toFixed(2);
  }

  /**
   * This method helps detect if the user prompt needs to run multiple functions in a chain.
   */
  private async detectRequiredFunctions(message: string): Promise<string[]> {
    try {
      const openai = this.openAIConfig.createOpenAIClient();

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are an assistant that determines which functions need to be called to respond to a user's message. 

            You have access to the following functions:
            - searchProducts(query: string): searches for products by name or description and returns their price and details.
            - convertCurrencies(amount: number, from: string, to: string): converts a price from one currency to another.

            Your task:
            - Think step by step.
            - If the user asks something that requires data from one function to be used in another (e.g., find a price first, then convert it), include **both** functions in the result.
            - Only include the functions that are strictly necessary to fulfill the user’s request.

            Respond **only** with a JSON array of function names. For example:
            ["searchProducts"]
            ["searchProducts", "convertCurrencies"]
            ["convertCurrencies"]`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
      });

      const content = response.choices[0].message.content;
      const parsed = JSON.parse(content || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Could not parse function detection response:', error);
      return [];
    }
  }

  /**
   * This method get the required currency by the user and
   * just work in chain flow path
   */
  private async detectRequiredCurrency(
    message: string,
  ): Promise<string | null> {
    try {
      const openai = this.openAIConfig.createOpenAIClient();

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are an assistant that extracts the **target currency** a user wants to convert to from their message.
      
              Instructions:
              - Analyze the user's message carefully.
              - Identify the currency the user wants to convert **to** (not from).
              - Respond **only** with the standard 3-letter currency code (e.g., "USD", "EUR", "JPY").
              - If no target currency is mentioned or it's ambiguous, respond with "UNKNOWN".
              - Do **not** include any extra text or explanation—just the currency code as a plain string.
              
              Examples:
              User: "I want to convert 100 pesos to dollars" → "USD"
              User: "¿Cuánto es 50 euros en yenes?" → "JPY"
              User: "Cambio de 100 soles a dólares" → "USD"
              User: "Pásame el precio en libras" → "GBP"
              User: "Quiero saber el cambio actual" → "UNKNOWN"
            `,
          },
          {
            role: 'user',
            content: message,
          },
        ],
      });

      const content = response.choices[0].message.content;
      return content;
    } catch (error) {
      console.warn('Could not parse function detection response:', error);
      return '';
    }
  }
  /*
   * This method formats prices when the "price" property contains multiple values,
   * and calculates the average between them.
   */

  private getAveragePrice(priceString: string): number | null {
    const regex = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/;

    const match = priceString.match(regex);
    if (match) {
      const price1 = parseFloat(match[1]);
      const price2 = parseFloat(match[2]);
      const average = (price1 + price2) / 2;
      return average;
    }

    const singlePrice = parseFloat(priceString);
    if (!isNaN(singlePrice)) {
      return singlePrice;
    }
    return null;
  }

  /**
   * This method just run in chain flow path
   * and get 'productName', 'amount', 'currency' from DB
   */

  private async extractPriceFromText(
    query: string,
  ): Promise<ExtractPriceFromDB[]> {
    const filePath = path.join(process.cwd(), 'src/db/productsCSV.csv');

    const csvData = await new Promise<Product[]>((resolve) => {
      const data: Product[] = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: Product) => {
          if (
            row.displayTitle.toLowerCase().includes(query.toLowerCase()) ||
            row.embeddingText.toLowerCase().includes(query.toLowerCase())
          ) {
            data.push(row);
          }
        })
        .on('end', () => resolve(data));
    });

    const result = csvData.slice(0, 2);

    if (!result.length) {
      throw new Error('No matching products found.');
    }

    return result.map((product) => {
      const priceString = product.price.replace(/[^0-9.]/g, '');
      const price = this.getAveragePrice(priceString);
      return {
        productName: product.displayTitle,
        amount: price ? +price : 0,
        currency: 'USD',
      };
    });
  }
}
