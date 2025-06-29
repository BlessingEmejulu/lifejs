import { z } from "zod";
import { TTSBase, type TTSGenerateJob } from "../base";

// Config
export const googleCloudTTSConfigSchema = z.object({
  projectId: z.string().default(process.env.GOOGLE_CLOUD_PROJECT_ID ?? ""),
  keyFilename: z.string().optional().default(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  apiKey: z.string().optional().default(process.env.GOOGLE_CLOUD_API_KEY),
  voice: z
    .object({
      languageCode: z.string().default("en-US"),
      name: z.string().default("en-US-Wavenet-D"),
      ssmlGender: z.enum(["NEUTRAL", "FEMALE", "MALE"]).default("NEUTRAL"),
    })
    .default({}),
  audioConfig: z
    .object({
      audioEncoding: z.enum(["LINEAR16", "MP3", "OGG_OPUS"]).default("LINEAR16"),
      sampleRateHertz: z.number().default(16000),
      speakingRate: z.number().min(0.25).max(4.0).default(1.0),
      pitch: z.number().min(-20.0).max(20.0).default(0.0),
      volumeGainDb: z.number().min(-96.0).max(16.0).default(0.0),
    })
    .default({}),
});

// Model
export class GoogleCloudTTS extends TTSBase<typeof googleCloudTTSConfigSchema> {
  #textToSpeechClient: any;
  #activeJobs = new Set<string>();

  constructor(config: z.input<typeof googleCloudTTSConfigSchema>) {
    super(googleCloudTTSConfigSchema, config);
    
    // Validate that we have either credentials or API key
    if (!this.config.projectId) {
      throw new Error(
        "GOOGLE_CLOUD_PROJECT_ID environment variable or config.projectId must be provided to use this model.",
      );
    }

    if (!this.config.keyFilename && !this.config.apiKey) {
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS environment variable, config.keyFilename, or config.apiKey must be provided to use this model.",
      );
    }

    this.#initializeClient();
  }

  async #initializeClient() {
    try {
      // Dynamic import to avoid loading the Google Cloud library if not needed
      const { TextToSpeechClient } = await import("@google-cloud/text-to-speech");
      
      const clientConfig: any = {
        projectId: this.config.projectId,
      };

      if (this.config.keyFilename) {
        clientConfig.keyFilename = this.config.keyFilename;
      } else if (this.config.apiKey) {
        clientConfig.apiKey = this.config.apiKey;
      }

      this.#textToSpeechClient = new TextToSpeechClient(clientConfig);
    } catch (error) {
      throw new Error(
        `Failed to initialize Google Cloud Text-to-Speech client: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async generate(): Promise<TTSGenerateJob> {
    // Create a new generation job
    const job = this.createGenerateJob();
    this.#activeJobs.add(job.id);

    // Listen to job cancellation
    job.raw.abortController.signal.addEventListener("abort", () => {
      this.#activeJobs.delete(job.id);
    });

    return job;
  }

  protected async _onGeneratePushText(job: TTSGenerateJob, text: string): Promise<void> {
    // Check if job was cancelled
    if (!this.#activeJobs.has(job.id) || job.raw.abortController.signal.aborted) {
      return;
    }

    try {
      // Prepare the request
      const request = {
        input: { text },
        voice: {
          languageCode: this.config.voice.languageCode,
          name: this.config.voice.name,
          ssmlGender: this.config.voice.ssmlGender,
        },
        audioConfig: {
          audioEncoding: this.config.audioConfig.audioEncoding,
          sampleRateHertz: this.config.audioConfig.sampleRateHertz,
          speakingRate: this.config.audioConfig.speakingRate,
          pitch: this.config.audioConfig.pitch,
          volumeGainDb: this.config.audioConfig.volumeGainDb,
        },
      };

      // Call the Google Cloud TTS API
      const [response] = await this.#textToSpeechClient.synthesizeSpeech(request);

      // Check if job was cancelled during the API call
      if (!this.#activeJobs.has(job.id) || job.raw.abortController.signal.aborted) {
        return;
      }

      // Convert the audio content to Int16Array
      if (response.audioContent) {
        let audioBuffer: Buffer;
        
        if (response.audioContent instanceof Uint8Array) {
          audioBuffer = Buffer.from(response.audioContent);
        } else if (typeof response.audioContent === "string") {
          audioBuffer = Buffer.from(response.audioContent, "base64");
        } else {
          audioBuffer = response.audioContent as Buffer;
        }

        // Convert buffer to Int16Array (assuming LINEAR16 encoding)
        if (this.config.audioConfig.audioEncoding === "LINEAR16") {
          const pcmBytes = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
          job.raw.receiveChunk({
            type: "content",
            voiceChunk: pcmBytes,
            textChunk: text,
          });
          
          // Clean up the job after successful processing
          this.#activeJobs.delete(job.id);
        } else {
          // For non-LINEAR16 formats, we need to decode the audio first
          // This is a simplified implementation - in practice, you might want to use a library like node-wav
          throw new Error(`Audio encoding ${this.config.audioConfig.audioEncoding} is not currently supported. Please use LINEAR16.`);
        }
      }
      
    } catch (error) {
      // Check if job was cancelled during error handling
      if (!this.#activeJobs.has(job.id) || job.raw.abortController.signal.aborted) {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      job.raw.receiveChunk({ type: "error", error: errorMessage });
    }
  }
}
