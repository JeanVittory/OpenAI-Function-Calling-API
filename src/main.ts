import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('OpenAI Server')
    .setDescription(
      "A server that contains an endpoint to retrieve products based on a user's prompt.",
    )
    .setVersion('1.0')
    .build();

  // WARNING: This is UNSAFE. Only used here for testing the API with the frontend provided
  app.enableCors({
    origin: '*', // Development-only setting: Allows all origins since frontend origin may vary (set via .env)
  });
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
