import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import errorHandler from "@/helpers/handleError";
import CustomError from "@/helpers/CustomError";

//   Initialize OpenAI client with API key
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

//   POST endpoint for audio transcription using OpenAI Whisper
export async function POST(request: NextRequest) {
  try {
    //   Parse multipart form data containing audio file
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;

    //   Validate audio file exists and is valid
    if (!audioFile) {
      throw new CustomError("Audio file is required", 400);
    }

    //   Check file type - should be audio format
    if (!audioFile.type.startsWith("audio/")) {
      throw new CustomError(
        "Invalid file type. Only audio files are allowed",
        400
      );
    }

    //   Check file size limit (25MB max for Whisper API)
    const maxSize = 25 * 1024 * 1024; // 25MB in bytes
    if (audioFile.size > maxSize) {
      throw new CustomError("Audio file too large. Maximum size is 25MB", 400);
    }

    console.log("🎙️ Transcribing audio file:", {
      name: audioFile.name,
      type: audioFile.type,
      size: audioFile.size,
    });

    //   Algorithm: Call OpenAI Whisper API with optimized settings to reduce hallucinations
    const transcription = await client.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "id", // Indonesian language
      response_format: "text",
      temperature: 0.0, // Lower temperature reduces hallucinations
      prompt:
        "Transkripsi percakapan dalam bahasa Indonesia tentang keuangan, transaksi, dan pengeluaran.", // Context prompt
    });

    //   Algorithm: Validate transcription result and filter potential hallucinations
    if (!transcription || transcription.trim().length === 0) {
      throw new CustomError(
        "Unable to transcribe audio. Please try again",
        500
      );
    }

    const cleanTranscription = transcription.trim();

    //   Algorithm: Check for common hallucination patterns
    const hallucinations = [
      "selamat menikmati",
      "terima kasih",
      "thank you for watching",
      "thanks for watching",
      "subscribe",
      "like and subscribe",
    ];

    const isHallucination = hallucinations.some((pattern) =>
      cleanTranscription.toLowerCase().includes(pattern)
    );

    if (isHallucination) {
      console.log("❌ Detected potential hallucination:", cleanTranscription);
      throw new CustomError(
        "Recording unclear or contains background noise. Please try speaking again.",
        400
      );
    }

    //   Algorithm: Check minimum meaningful length
    if (cleanTranscription.length < 3) {
      console.log("❌ Transcription too short:", cleanTranscription.length);
      throw new CustomError(
        "Recording too short or unclear. Please speak longer.",
        400
      );
    }

    console.log(
      "✅ Audio transcription successful:",
      cleanTranscription.substring(0, 100)
    );

    //   Return successful transcription response
    return NextResponse.json(
      {
        message: "Audio transcribed successfully",
        transcription: cleanTranscription,
      },
      { status: 200 }
    );
  } catch (error) {
    //   Handle and return error response
    console.error("  Audio transcription error:", error);
    const { message, status } = errorHandler(error);
    return NextResponse.json({ message }, { status });
  }
}

//   GET endpoint to check transcription service health
export async function GET() {
  return NextResponse.json(
    {
      message: "Audio transcription service is running",
      model: "whisper-1",
      supported_formats: ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"],
      max_file_size: "25MB",
    },
    { status: 200 }
  );
}
