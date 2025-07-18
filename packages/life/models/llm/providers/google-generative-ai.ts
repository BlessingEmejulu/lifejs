import type { Message, ToolDefinition } from "@/agent/resources";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LLMBase, type LLMGenerateMessageJob } from "../base";

// Config
export const googleGenerativeAILLMConfigSchema = z.object({
  apiKey: z.string().default(process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? ""),
  model: z
    .enum([
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-1.0-pro",
      "gemini-1.5-flash-8b",
    ])
    .default("gemini-1.5-flash"),
  temperature: z.number().min(0).max(2).default(0.5),
  topP: z.number().min(0).max(1).default(0.95),
  topK: z.number().min(1).max(40).default(40),
  maxOutputTokens: z.number().min(1).max(8192).default(2048),
  safetySettings: z
    .array(
      z.object({
        category: z.enum([
          "HARM_CATEGORY_HATE_SPEECH",
          "HARM_CATEGORY_DANGEROUS_CONTENT",
          "HARM_CATEGORY_HARASSMENT",
          "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        ]),
        threshold: z.enum([
          "BLOCK_NONE",
          "BLOCK_ONLY_HIGH",
          "BLOCK_MEDIUM_AND_ABOVE",
          "BLOCK_LOW_AND_ABOVE",
        ]),
      }),
    )
    .default([]),
});

/**
 * Google Generative AI (Gemini) LLM Provider for Life.js
 * 
 * This provider integrates with Google's Generative AI API (Gemini models) to provide
 * language model capabilities including text generation, function calling, and structured
 * object generation.
 * 
 * ## Features
 * - Text generation with streaming support
 * - Function/tool calling capabilities  
 * - Structured object generation with JSON schema validation
 * - Support for conversation history and system instructions
 * - Configurable model parameters (temperature, top-k, top-p, etc.)
 * - Async initialization for improved performance
 * - Comprehensive error handling and validation
 * 
 * ## Supported Models
 * - gemini-1.5-flash (recommended for most use cases)
 * - gemini-1.5-pro (advanced reasoning and analysis)
 * - gemini-1.0-pro (legacy model)
 * - gemini-1.5-flash-8b (lightweight variant)
 * 
 * ## Configuration
 * The provider requires a Google AI API key which can be provided via:
 * - `apiKey` config property
 * - `GOOGLE_GENERATIVE_AI_API_KEY` environment variable
 * 
 * ## Safety Settings
 * Supports configurable safety settings for content filtering:
 * - HARM_CATEGORY_HATE_SPEECH
 * - HARM_CATEGORY_DANGEROUS_CONTENT
 * - HARM_CATEGORY_HARASSMENT
 * - HARM_CATEGORY_SEXUALLY_EXPLICIT
 * 
 * @example Basic Usage
 * ```typescript
 * const llm = new GoogleGenerativeAILLM({
 *   apiKey: "your-api-key",
 *   model: "gemini-1.5-flash",
 *   temperature: 0.7
 * });
 * 
 * // Wait for initialization before use
 * await llm.waitForInitialization();
 * 
 * const job = await llm.generateMessage({
 *   messages: [{ role: "user", content: "Hello!" }],
 *   tools: []
 * });
 * ```
 * 
 * @example With Function Calling
 * ```typescript
 * const job = await llm.generateMessage({
 *   messages: [{ role: "user", content: "What's the weather like?" }],
 *   tools: [{
 *     id: "get_weather",
 *     description: "Get current weather",
 *     inputSchema: z.object({ location: z.string() })
 *   }]
 * });
 * ```
 * 
 * @example Structured Object Generation
 * ```typescript
 * const result = await llm.generateObject({
 *   messages: [{ role: "user", content: "Describe a person" }],
 *   schema: z.object({
 *     name: z.string(),
 *     age: z.number(),
 *     occupation: z.string()
 *   })
 * });
 * ```
 */
export class GoogleGenerativeAILLM extends LLMBase<typeof googleGenerativeAILLMConfigSchema> {
  #generativeAI: any; // GoogleGenerativeAI - typed after dynamic import
  #model: any; // GenerativeModel - typed after dynamic import  
  #initPromise: Promise<void>;

  constructor(config: z.input<typeof googleGenerativeAILLMConfigSchema>) {
    super(googleGenerativeAILLMConfigSchema, config);
    
    if (!this.config.apiKey) {
      throw new Error(
        "GOOGLE_GENERATIVE_AI_API_KEY environment variable or config.apiKey must be provided to use this model.",
      );
    }

    this.#initPromise = this.#initializeClient();
  }

  /**
   * Initialize the Google Generative AI client
   * 
   * This method dynamically imports the Google Generative AI SDK and initializes
   * the client with the provided API key and configuration. The dynamic import
   * ensures the SDK is only loaded when needed, improving startup performance.
   * 
   * @private
   * @throws {Error} If the client initialization fails due to invalid API key,
   *                 network issues, or SDK import problems
   * @returns {Promise<void>} Resolves when the client is successfully initialized
   */
  async #initializeClient() {
    try {
      // Dynamic import to avoid loading the Google Generative AI library if not needed
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      
      this.#generativeAI = new GoogleGenerativeAI(this.config.apiKey);
      this.#model = this.#generativeAI.getGenerativeModel({
        model: this.config.model,
        generationConfig: {
          temperature: this.config.temperature,
          topP: this.config.topP,
          topK: this.config.topK,
          maxOutputTokens: this.config.maxOutputTokens,
        },
        safetySettings: this.config.safetySettings,
      });
    } catch (error) {
      throw new Error(
        `Failed to initialize Google Generative AI client: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Wait for the client to be initialized
   * 
   * This method should be called before using any LLM functionality to ensure
   * the Google Generative AI client is properly initialized. It's safe to call
   * this method multiple times - it will only initialize once.
   * 
   * @returns {Promise<void>} Resolves when the client is ready for use
   * @throws {Error} If initialization fails
   * 
   * @example
   * ```typescript
   * const llm = new GoogleGenerativeAILLM({ apiKey: "your-key" });
   * await llm.waitForInitialization();
   * // Now safe to use generateMessage, generateObject, etc.
   * ```
   */
  async waitForInitialization(): Promise<void> {
    await this.#initPromise;
  }

  /**
   * Convert a Life.js message to Gemini format
   * 
   * @private
   * @param message - Life.js message object
   * @returns Gemini-formatted message or null if message type is not supported
   */

  #toGeminiMessage(message: Message): any {
    if (message.role === "user") {
      return {
        role: "user",
        parts: [{ text: message.content }],
      };
    }

    if (message.role === "agent") {
      const parts: any[] = [];
      
      // Add text content if available
      if (message.content) {
        parts.push({ text: message.content });
      }

      // Add function calls if available
      if (message.toolsRequests && message.toolsRequests.length > 0) {
        for (const request of message.toolsRequests) {
          parts.push({
            functionCall: {
              name: request.toolId,
              args: request.input,
            },
          });
        }
      }

      return {
        role: "model",
        parts,
      };
    }

    if (message.role === "system") {
      // System messages are handled separately in Gemini via systemInstruction
      // We'll filter them out here and handle them in the chat session
      return null;
    }

    if (message.role === "tool-response") {
      return {
        role: "function",
        parts: [
          {
            functionResponse: {
              name: message.toolId,
              response: message.output,
            },
          },
        ],
      };
    }

    return null;
  }

  /**
   * Convert an array of Life.js messages to Gemini format
   * 
   * @private
   * @param messages - Array of Life.js message objects
   * @returns Array of Gemini-formatted messages with null values filtered out
   */
  #toGeminiMessages(messages: Message[]): any[] {
    return messages
      .map((message) => this.#toGeminiMessage(message))
      .filter(Boolean);
  }

  /**
   * Convert a Life.js tool definition to Gemini format
   * 
   * @private
   * @param tool - Life.js tool definition
   * @returns Gemini-formatted tool declaration
   */
  #toGeminiTool(tool: ToolDefinition): any {
    return {
      functionDeclarations: [
        {
          name: tool.id,
          description: tool.description,
          parameters: zodToJsonSchema(tool.inputSchema),
        },
      ],
    };
  }

  /**
   * Convert an array of Life.js tool definitions to Gemini format
   * 
   * @private
   * @param tools - Array of Life.js tool definitions
   * @returns Array of Gemini-formatted tool declarations, or empty array if no tools
   */

  #toGeminiTools(tools: ToolDefinition[]): any[] {
    if (tools.length === 0) return [];
    
    return [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.id,
          description: tool.description,
          parameters: zodToJsonSchema(tool.inputSchema),
        })),
      },
    ];
  }

  /**
   * Generate a message with job management
   * 
   * This method handles the main text generation functionality with support for:
   * - Streaming responses that can be cancelled
   * - Function/tool calling with automatic schema validation
   * - Conversation history with message formatting
   * - System instructions for context setting
   * - Comprehensive error handling and recovery
   * 
   * The method returns immediately with a job object that provides access to the
   * streaming response. The actual generation happens asynchronously.
   * 
   * @param params - Generation parameters
   * @param params.messages - Conversation history including user, agent, system, and tool messages
   * @param params.tools - Available tools/functions that the model can call
   * @returns {Promise<LLMGenerateMessageJob>} Job object for tracking generation progress
   * 
   * @example Basic text generation
   * ```typescript
   * const job = await llm.generateMessage({
   *   messages: [
   *     { role: "system", content: "You are a helpful assistant." },
   *     { role: "user", content: "Hello!" }
   *   ],
   *   tools: []
   * });
   * 
   * for await (const chunk of job.getStream()) {
   *   if (chunk.type === "content") {
   *     console.log(chunk.content);
   *   }
   * }
   * ```
   * 
   * @example With function calling
   * ```typescript
   * const job = await llm.generateMessage({
   *   messages: [{ role: "user", content: "What's 2+2?" }],
   *   tools: [{
   *     id: "calculate",
   *     description: "Perform mathematical calculation",
   *     inputSchema: z.object({ expression: z.string() })
   *   }]
   * });
   * 
   * for await (const chunk of job.getStream()) {
   *   if (chunk.type === "tool") {
   *     console.log(`Tool call: ${chunk.toolId}`, chunk.toolInput);
   *   }
   * }
   * ```
   */
  async generateMessage(
    params: Parameters<typeof LLMBase.prototype.generateMessage>[0],
  ): Promise<LLMGenerateMessageJob> {
    // Wait for initialization to complete
    await this.#initPromise;
    
    // Create a new job
    const job = this.createGenerateMessageJob();

    try {
      // Prepare tools and messages in Gemini format
      const geminiTools = this.#toGeminiTools(params.tools);
      const geminiMessages = this.#toGeminiMessages(params.messages);

      // Extract system instruction from messages
      const systemMessage = params.messages.find(m => m.role === "system");
      const systemInstruction = systemMessage?.content;

      // Create chat session
      const chat = this.#model.startChat({
        history: geminiMessages.slice(0, -1), // All messages except the last one
        tools: geminiTools.length > 0 ? geminiTools : undefined,
        systemInstruction: systemInstruction,
      });

      // Get the last message (current user input)
      const lastMessage = geminiMessages[geminiMessages.length - 1];
      const userInput = lastMessage?.parts?.[0]?.text || "";

      // Generate streaming response
      const result = await chat.sendMessageStream(userInput);

      // Process the stream
      for await (const chunk of result.stream) {
        // Check if job was cancelled
        if (job.raw.abortController.signal.aborted) break;

        const chunkText = chunk.text();
        if (chunkText) {
          job.raw.receiveChunk({ type: "content", content: chunkText });
        }

        // Handle function calls
        if (chunk.functionCalls) {
          for (const functionCall of chunk.functionCalls) {
            job.raw.receiveChunk({
              type: "tool",
              toolId: functionCall.name,
              toolInput: functionCall.args || {},
            });
          }
        }
      }

      // Signal end of generation
      job.raw.receiveChunk({ type: "end" });

    } catch (error) {
      // Handle errors
      if (job.raw.abortController.signal.aborted) {
        return job;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      job.raw.receiveChunk({ type: "error", error: errorMessage });
    }

    return job;
  }

  /**
   * Generate a structured object
   * 
   * This method generates responses that conform to a specific JSON schema.
   * It automatically adds schema validation instructions to the prompt and
   * validates the response against the provided schema using Zod.
   * 
   * The method is ideal for extracting structured data from natural language
   * or generating consistent API responses.
   * 
   * @param params - Generation parameters
   * @param params.messages - Conversation history and prompts
   * @param params.schema - Zod schema that the response must conform to
   * @returns {Promise<{ success: true; data: T } | { success: false; error: string }>}
   *          Success object with validated data or failure object with error message
   * 
   * @example Extract structured data
   * ```typescript
   * const result = await llm.generateObject({
   *   messages: [{ 
   *     role: "user", 
   *     content: "John is 30 years old and works as a software engineer" 
   *   }],
   *   schema: z.object({
   *     name: z.string(),
   *     age: z.number(),
   *     occupation: z.string()
   *   })
   * });
   * 
   * if (result.success) {
   *   console.log(result.data); // { name: "John", age: 30, occupation: "software engineer" }
   * } else {
   *   console.error(result.error);
   * }
   * ```
   * 
   * @example Generate consistent API responses
   * ```typescript
   * const result = await llm.generateObject({
   *   messages: [{ 
   *     role: "user", 
   *     content: "Generate a user profile for testing" 
   *   }],
   *   schema: z.object({
   *     id: z.string(),
   *     username: z.string(),
   *     email: z.string().email(),
   *     preferences: z.object({
   *       theme: z.enum(["light", "dark"]),
   *       notifications: z.boolean()
   *     })
   *   })
   * });
   * ```
   */
  async generateObject(
    params: Parameters<typeof LLMBase.prototype.generateObject>[0],
  ): Promise<{ success: true; data: z.infer<typeof params.schema> } | { success: false; error: string }> {
    // Wait for initialization to complete
    await this.#initPromise;
    
    try {
      // Prepare messages in Gemini format
      const geminiMessages = this.#toGeminiMessages(params.messages);

      // Extract system instruction from messages
      const systemMessage = params.messages.find(m => m.role === "system");
      const systemInstruction = systemMessage?.content;

      // Create the JSON schema prompt
      const jsonSchema = zodToJsonSchema(params.schema, { name: "response" });
      const schemaPrompt = `Please respond with a valid JSON object that matches this schema: ${JSON.stringify(jsonSchema)}`;
      
      // Add schema instruction to the last user message
      const lastMessage = geminiMessages[geminiMessages.length - 1];
      if (lastMessage?.parts?.[0]?.text) {
        lastMessage.parts[0].text += `\n\n${schemaPrompt}`;
      }

      // Create chat session
      const chat = this.#model.startChat({
        history: geminiMessages.slice(0, -1),
        systemInstruction: systemInstruction,
      });

      // Generate response
      const userInput = lastMessage?.parts?.[0]?.text || schemaPrompt;
      const result = await chat.sendMessage(userInput);
      const response = await result.response;
      const text = response.text();

      // Try to parse JSON from the response
      try {
        // Extract JSON from response (in case there's extra text)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : text;
        const parsedData = JSON.parse(jsonText);

        // Validate against schema
        const validatedData = params.schema.parse(parsedData);
        
        return { success: true, data: validatedData };
      } catch (parseError) {
        return {
          success: false,
          error: `Failed to parse or validate JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
