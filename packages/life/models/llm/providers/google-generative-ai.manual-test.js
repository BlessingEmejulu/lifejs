// Test file to validate our Google Generative AI implementation
// This will be a minimal test that focuses on the core functionality

import { GoogleGenerativeAILLM } from "./google-generative-ai.js";

async function testGoogleGenerativeAI() {
  console.log("Testing Google Generative AI LLM Provider...");
  
  // Test 1: Constructor validation
  try {
    const llm = new GoogleGenerativeAILLM({
      apiKey: "test-key",
      model: "gemini-1.5-flash",
      temperature: 0.7,
    });
    console.log("✓ Constructor works correctly");
  } catch (error) {
    console.error("✗ Constructor failed:", error);
  }

  // Test 2: Config validation
  try {
    new GoogleGenerativeAILLM({
      // Missing API key should throw error
      model: "gemini-1.5-flash",
    });
    console.error("✗ Should have thrown error for missing API key");
  } catch (error) {
    console.log("✓ Correctly validates missing API key");
  }

  console.log("Basic validation tests completed");
}

// Only run if this file is executed directly
if (typeof window === "undefined") {
  testGoogleGenerativeAI();
}
