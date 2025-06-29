/**
 * Example demonstrating how to use the Google Cloud TTS provider
 * 
 * Prerequisites:
 * 1. Install the Google Cloud TTS library: npm install @google-cloud/text-to-speech
 * 2. Set up authentication:
 *    - Option A: Set GOOGLE_APPLICATION_CREDENTIALS environment variable to path of service account key
 *    - Option B: Set GOOGLE_CLOUD_API_KEY environment variable
 * 3. Set GOOGLE_CLOUD_PROJECT_ID environment variable
 */

import { GoogleCloudTTS } from "../providers/google-cloud";

async function demonstrateGoogleCloudTTS() {
  try {
    // Initialize the TTS provider
    const tts = new GoogleCloudTTS({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || "your-project-id",
      // Use service account key file
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      // Or use API key instead
      // apiKey: process.env.GOOGLE_CLOUD_API_KEY,
      voice: {
        languageCode: "en-US",
        name: "en-US-Wavenet-D",
        ssmlGender: "NEUTRAL",
      },
      audioConfig: {
        audioEncoding: "LINEAR16",
        sampleRateHertz: 16000,
        speakingRate: 1.0,
        pitch: 0.0,
        volumeGainDb: 0.0,
      },
    });

    console.log("Generating speech...");

    // Generate speech
    const job = await tts.generate();
    
    // Push text to be synthesized
    job.pushText("Hello! This is a test of the Google Cloud Text-to-Speech integration with Life.js.");
    
    // Listen to the audio stream
    const stream = job.getStream();
    let totalAudioDuration = 0;
    let totalChunks = 0;

    for await (const chunk of stream) {
      if (chunk.type === "content") {
        totalChunks++;
        totalAudioDuration += chunk.durationMs;
        console.log(`Received audio chunk ${totalChunks}: ${chunk.textChunk} (${chunk.durationMs}ms, ${chunk.voiceChunk.length} samples)`);
      } else if (chunk.type === "end") {
        console.log("Speech generation completed");
        break;
      } else if (chunk.type === "error") {
        console.error("Error during speech generation:", chunk.error);
        break;
      }
    }

    console.log(`Total audio duration: ${totalAudioDuration}ms`);
    console.log(`Total chunks received: ${totalChunks}`);

  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the demonstration if this file is executed directly
if (require.main === module) {
  demonstrateGoogleCloudTTS();
}

export { demonstrateGoogleCloudTTS };
