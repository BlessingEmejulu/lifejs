import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleGenerativeAILLM } from "../providers/google-generative-ai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Mock the Google Generative AI SDK
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn(),
}));

describe("GoogleGenerativeAILLM", () => {
  const mockGenerativeAI = {
    getGenerativeModel: vi.fn(),
  };

  const mockModel = {
    startChat: vi.fn(),
    generateContent: vi.fn(),
  };

  const mockChatSession = {
    sendMessage: vi.fn(),
    sendMessageStream: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (GoogleGenerativeAI as any).mockImplementation(() => mockGenerativeAI);
    mockGenerativeAI.getGenerativeModel.mockReturnValue(mockModel);
    mockModel.startChat.mockReturnValue(mockChatSession);
  });

  afterEach(() => {
    // Clean up any environment variables that were set during tests
    if (typeof process !== "undefined" && process.env) {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    }
  });

  describe("constructor", () => {
    it("should create an instance with valid config", () => {
      const config = {
        apiKey: "test-api-key",
        model: "gemini-pro",
      };

      const llm = new GoogleGenerativeAILLM(config);
      expect(llm).toBeInstanceOf(GoogleGenerativeAILLM);
    });

    it("should throw error when API key is missing", () => {
      const config = {
        model: "gemini-pro",
      };

      expect(() => new GoogleGenerativeAILLM(config)).toThrow(
        "GOOGLE_GENERATIVE_AI_API_KEY environment variable or config.apiKey must be provided",
      );
    });

    it("should use environment variable when config.apiKey is not provided", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "env-api-key";
      const config = {
        model: "gemini-pro",
      };

      const llm = new GoogleGenerativeAILLM(config);
      expect(llm).toBeInstanceOf(GoogleGenerativeAILLM);
      
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    });
  });

  describe("generateMessage", () => {
    it("should generate a message successfully", async () => {
      const config = {
        apiKey: "test-api-key",
        model: "gemini-pro",
      };

      const mockResponse = {
        text: vi.fn().mockReturnValue("Hello, world!"),
        functionCalls: undefined,
      };

      const mockStream = {
        stream: (async function* () {
          yield mockResponse;
        })(),
      };

      mockChatSession.sendMessageStream.mockResolvedValue(mockStream);

      const llm = new GoogleGenerativeAILLM(config);
      await llm.waitForInitialization();

      const job = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "Hello",
          },
        ],
        tools: [],
      });

      expect(job).toBeDefined();
      expect(mockChatSession.sendMessageStream).toHaveBeenCalledWith("Hello");
    });

    it("should handle function calls in response", async () => {
      const config = {
        apiKey: "test-api-key",
        model: "gemini-pro",
      };

      const mockFunctionCall = {
        name: "test-function",
        args: { param: "value" },
      };

      const mockResponse = {
        text: vi.fn().mockReturnValue(""),
        functionCalls: [mockFunctionCall],
      };

      const mockStream = {
        stream: (async function* () {
          yield mockResponse;
        })(),
      };

      mockChatSession.sendMessageStream.mockResolvedValue(mockStream);

      const llm = new GoogleGenerativeAILLM(config);
      await llm.waitForInitialization();

      const job = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "Call a function",
          },
        ],
        tools: [
          {
            id: "test-function",
            name: "test-function",
            description: "Test function",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      });

      expect(job).toBeDefined();
      expect(mockChatSession.sendMessageStream).toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      const config = {
        apiKey: "test-api-key",
        model: "gemini-pro",
      };

      const error = new Error("API Error");
      mockChatSession.sendMessageStream.mockRejectedValue(error);

      const llm = new GoogleGenerativeAILLM(config);
      await llm.waitForInitialization();

      const job = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "Hello",
          },
        ],
        tools: [],
      });

      expect(job).toBeDefined();
      // The job should handle the error internally
    });
  });

  describe("generateObject", () => {
    it("should generate a structured object successfully", async () => {
      const config = {
        apiKey: "test-api-key",
        model: "gemini-pro",
      };

      const mockResponse = {
        response: {
          text: vi.fn().mockReturnValue('{"name": "John", "age": 30}'),
        },
      };

      mockChatSession.sendMessage.mockResolvedValue(mockResponse);

      const llm = new GoogleGenerativeAILLM(config);
      await llm.waitForInitialization();

      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name", "age"],
      };

      const result = await llm.generateObject({
        messages: [
          {
            role: "user",
            content: "Generate a person object",
          },
        ],
        schema: schema as any,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ name: "John", age: 30 });
      }
    });

    it("should handle invalid JSON response", async () => {
      const config = {
        apiKey: "test-api-key",
        model: "gemini-pro",
      };

      const mockResponse = {
        response: {
          text: vi.fn().mockReturnValue("Invalid JSON"),
        },
      };

      mockChatSession.sendMessage.mockResolvedValue(mockResponse);

      const llm = new GoogleGenerativeAILLM(config);
      await llm.waitForInitialization();

      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      };

      const result = await llm.generateObject({
        messages: [
          {
            role: "user",
            content: "Generate an object",
          },
        ],
        schema: schema as any,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to parse or validate JSON response");
      }
    });

    it("should handle API errors", async () => {
      const config = {
        apiKey: "test-api-key",
        model: "gemini-pro",
      };

      const error = new Error("API Error");
      mockChatSession.sendMessage.mockRejectedValue(error);

      const llm = new GoogleGenerativeAILLM(config);
      await llm.waitForInitialization();

      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      };

      const result = await llm.generateObject({
        messages: [
          {
            role: "user",
            content: "Generate an object",
          },
        ],
        schema: schema as any,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("API Error");
      }
    });
  });

  describe("message conversion", () => {
    it("should convert user messages correctly", () => {
      const config = {
        apiKey: "test-api-key",
        model: "gemini-pro",
      };

      const llm = new GoogleGenerativeAILLM(config);
      
      // Test private method through reflection
      const convertMessage = (llm as any)["#toGeminiMessage"];
      
      const userMessage = {
        role: "user",
        content: "Hello",
      };

      const result = convertMessage.call(llm, userMessage);
      
      expect(result).toEqual({
        role: "user",
        parts: [{ text: "Hello" }],
      });
    });

    it("should convert agent messages with tool requests correctly", () => {
      const config = {
        apiKey: "test-api-key",
        model: "gemini-pro",
      };

      const llm = new GoogleGenerativeAILLM(config);
      
      // Test private method through reflection
      const convertMessage = (llm as any)["#toGeminiMessage"];
      
      const agentMessage = {
        role: "agent",
        content: "I'll call a function",
        toolsRequests: [
          {
            id: "test-function",
            input: { param: "value" },
          },
        ],
      };

      const result = convertMessage.call(llm, agentMessage);
      
      expect(result).toEqual({
        role: "model",
        parts: [
          { text: "I'll call a function" },
          {
            functionCall: {
              name: "test-function",
              args: { param: "value" },
            },
          },
        ],
      });
    });

    it("should convert tool response messages correctly", () => {
      const config = {
        apiKey: "test-api-key",
        model: "gemini-pro",
      };

      const llm = new GoogleGenerativeAILLM(config);
      
      // Test private method through reflection
      const convertMessage = (llm as any)["#toGeminiMessage"];
      
      const toolResponseMessage = {
        role: "tool-response",
        toolId: "test-function",
        output: { result: "success" },
      };

      const result = convertMessage.call(llm, toolResponseMessage);
      
      expect(result).toEqual({
        role: "function",
        parts: [
          {
            functionResponse: {
              name: "test-function",
              response: { result: "success" },
            },
          },
        ],
      });
    });
  });
});
