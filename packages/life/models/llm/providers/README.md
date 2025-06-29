# LLM Providers

This directory contains Large Language Model (LLM) providers for Life.js. Each provider implements the `LLMBase` class and provides a unified interface for different language model services.

## Available Providers

### OpenAI (`openai.ts`)
- GPT-4 and GPT-4o models
- Function calling support
- Streaming responses
- Structured object generation

### Google Generative AI (`google-generative-ai.ts`)
- Gemini models (1.5 Flash, 1.5 Pro, 1.0 Pro)
- Function calling support
- Content safety controls
- Streaming responses and structured generation

## Creating a New Provider

To add a new LLM provider:

1. **Create the provider file**: Create a new file in this directory (e.g., `my-llm.ts`)

2. **Implement the base class**: Your provider must extend `LLMBase`:
   ```typescript
   import { LLMBase, type LLMGenerateMessageJob } from "../base";
   import { z } from "zod";

   export const myLLMConfigSchema = z.object({
     apiKey: z.string(),
     model: z.string().default("default-model"),
     // other config options...
   });

   export class MyLLM extends LLMBase<typeof myLLMConfigSchema> {
     constructor(config: z.input<typeof myLLMConfigSchema>) {
       super(myLLMConfigSchema, config);
       // Initialize your LLM client...
     }

     async generateMessage(params: {
       messages: Message[];
       tools: ToolDefinition[];
     }): Promise<LLMGenerateMessageJob> {
       const job = this.createGenerateMessageJob();
       
       // Implement streaming message generation
       // Send chunks using: job.raw.receiveChunk({ type: "content", content: "..." })
       // Send tool calls using: job.raw.receiveChunk({ type: "tool", toolId: "...", toolInput: {...} })
       // Signal end using: job.raw.receiveChunk({ type: "end" })
       // Handle errors using: job.raw.receiveChunk({ type: "error", error: "..." })
       
       return job;
     }

     async generateObject<T extends z.AnyZodObject>(params: {
       messages: Message[];
       schema: T;
     }): Promise<{ success: true; data: z.infer<T> } | { success: false; error: string }> {
       // Implement structured object generation
       // Return either success with validated data or failure with error
     }
   }
   ```

3. **Register the provider**: Add your provider to `../index.ts`:
   ```typescript
   import { MyLLM, myLLMConfigSchema } from "./providers/my-llm";
   
   export const llmProviders = {
     // existing providers...
     "my-llm": { class: MyLLM, configSchema: myLLMConfigSchema },
   } as const;
   ```

4. **Add dependencies**: If your provider requires additional NPM packages, add them to `peerDependencies` in `packages/life/package.json`

5. **Document the provider**: Update the documentation in `apps/website/content/docs/configuration/models.mdx`

## Key Concepts

### Message Types
- **System**: Initial instructions for the model
- **User**: Input from the user
- **Agent**: Response from the AI model
- **Tool Response**: Results from function calls

### Streaming
- All providers should support streaming responses
- Use `job.raw.receiveChunk()` to send chunks to the stream
- Support cancellation via `job.raw.abortController.signal`

### Function Calling
- Convert Life.js `ToolDefinition` to your provider's function calling format
- Handle function calls in the response stream
- Return tool calls with `toolId` and `toolInput`

### Structured Generation
- Use JSON Schema or similar for structured output
- Validate responses against the provided Zod schema
- Return success/failure with appropriate error handling

### Error Handling
- Gracefully handle API errors and network issues
- Respect cancellation signals
- Provide meaningful error messages

## Testing

Test your provider by:
1. Creating an example file in the `examples/` directory
2. Testing basic conversation capabilities
3. Testing function calling with various tools
4. Testing structured object generation
5. Verifying streaming and cancellation work correctly
6. Testing error conditions and edge cases
