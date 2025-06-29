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

// Model
export class GoogleGenerativeAILLM extends LLMBase<typeof googleGenerativeAILLMConfigSchema> {
  #generativeAI: any;
  #model: any;

  constructor(config: z.input<typeof googleGenerativeAILLMConfigSchema>) {
    super(googleGenerativeAILLMConfigSchema, config);
    
    if (!this.config.apiKey) {
      throw new Error(
        "GOOGLE_GENERATIVE_AI_API_KEY environment variable or config.apiKey must be provided to use this model.",
      );
    }

    this.#initializeClient();
  }

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
   * Format conversion
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
              name: request.id,
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
      // Gemini doesn't have a system role, so we convert it to user message
      return {
        role: "user",
        parts: [{ text: `System: ${message.content}` }],
      };
    }

    if (message.role === "tool-response") {
      return {
        role: "function",
        parts: [
          {
            functionResponse: {
              name: message.id,
              response: message.output,
            },
          },
        ],
      };
    }

    return null;
  }

  #toGeminiMessages(messages: Message[]): any[] {
    return messages
      .map(this.#toGeminiMessage)
      .filter(Boolean);
  }

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
   */
  async generateMessage(
    params: Parameters<typeof LLMBase.prototype.generateMessage>[0],
  ): Promise<LLMGenerateMessageJob> {
    // Create a new job
    const job = this.createGenerateMessageJob();

    try {
      // Prepare tools and messages in Gemini format
      const geminiTools = this.#toGeminiTools(params.tools);
      const geminiMessages = this.#toGeminiMessages(params.messages);

      // Create chat session
      const chat = this.#model.startChat({
        history: geminiMessages.slice(0, -1), // All messages except the last one
        tools: geminiTools.length > 0 ? geminiTools : undefined,
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
   */
  async generateObject(
    params: Parameters<typeof LLMBase.prototype.generateObject>[0],
  ): Promise<{ success: true; data: z.infer<typeof params.schema> } | { success: false; error: string }> {
    try {
      // Prepare messages in Gemini format
      const geminiMessages = this.#toGeminiMessages(params.messages);

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
