# TTS Providers

This directory contains Text-to-Speech (TTS) providers for Life.js. Each provider implements the `TTSBase` class and provides a unified interface for different TTS services.

## Available Providers

### Cartesia (`cartesia.ts`)
- High-quality, low-latency TTS using Cartesia's streaming API
- Supports real-time speech synthesis
- Requires a Cartesia API key

### Google Cloud Text-to-Speech (`google-cloud.ts`)
- Google Cloud's TTS service with wide language and voice support
- Uses the official Google Cloud client library
- Supports various audio formats and voice customization options
- Requires Google Cloud project setup and authentication

## Creating a New Provider

To add a new TTS provider:

1. **Create the provider file**: Create a new file in this directory (e.g., `my-provider.ts`)

2. **Implement the base class**: Your provider must extend `TTSBase`:
   ```typescript
   import { TTSBase, type TTSGenerateJob } from "../base";
   import { z } from "zod";

   export const myProviderConfigSchema = z.object({
     apiKey: z.string(),
     // other config options...
   });

   export class MyProvider extends TTSBase<typeof myProviderConfigSchema> {
     constructor(config: z.input<typeof myProviderConfigSchema>) {
       super(myProviderConfigSchema, config);
       // Initialize your provider...
     }

     async generate(): Promise<TTSGenerateJob> {
       const job = this.createGenerateJob();
       // Set up job cancellation handling...
       return job;
     }

     protected async _onGeneratePushText(job: TTSGenerateJob, text: string): Promise<void> {
       // Implement text-to-speech conversion for the given text
       // Send audio chunks using: job.raw.receiveChunk({ type: "content", voiceChunk, textChunk })
       // Handle errors using: job.raw.receiveChunk({ type: "error", error })
     }
   }
   ```

3. **Register the provider**: Add your provider to `../index.ts`:
   ```typescript
   import { MyProvider, myProviderConfigSchema } from "./providers/my-provider";
   
   export const ttsProviders = {
     // existing providers...
     "my-provider": { class: MyProvider, configSchema: myProviderConfigSchema },
   } as const;
   ```

4. **Add dependencies**: If your provider requires additional NPM packages, add them to `peerDependencies` in `packages/life/package.json`

5. **Document the provider**: Update the documentation in `apps/website/content/docs/configuration/models.mdx`

## Key Concepts

- **Jobs**: Each TTS generation request creates a job with a unique ID
- **Streaming**: Providers should send audio chunks as they become available
- **Cancellation**: Support job cancellation via the AbortController
- **Error Handling**: Gracefully handle API errors and network issues
- **Audio Format**: Life.js expects Int16Array audio data at 16kHz sample rate

## Testing

Test your provider by:
1. Creating an example file in the `examples/` directory
2. Testing with various text inputs
3. Verifying cancellation works correctly
4. Ensuring error conditions are handled properly
