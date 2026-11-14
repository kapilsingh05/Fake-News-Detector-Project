import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

// Load environment variables
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Check Gemini API key
if (!process.env.GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY is not defined in .env");
  throw new Error("Missing Gemini API key");
}

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const verificationCache = new Map();

// --------------------------------------------------
// Fetch news from FastAPI
// --------------------------------------------------
async function fetchNewsFromAPI(text, category) {
  if (!process.env.NEWSAPIURL) {
    console.error("Error: NEWSAPIURL is not defined in .env");
    return [];
  }

  try {
    const response = await fetch(process.env.NEWSAPIURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        news_text: text,
        category: category,
      }),
    });

    if (!response.ok) {
      throw new Error(`FastAPI HTTP error: ${response.status}`);
    }

    const data = await response.json();

    return data.results || [];
  } catch (error) {
    console.error("Failed to fetch news from FastAPI:", error);
    return [];
  }
}

// --------------------------------------------------
// Verify News
// --------------------------------------------------
app.post("/verify-news", async (req, res) => {
  const { text, category } = req.body;

  if (!text || !category) {
    return res.status(400).json({
      error: "News text and category are required",
    });
  }

  // Cache key
  const cacheKey = `${category.trim().toLowerCase()}\u0000${text.trim()}`;

  // Return cached result if available
  const cachedResponse = verificationCache.get(cacheKey);

  if (cachedResponse) {
    console.log("Returning cached result");
    return res.status(200).json(cachedResponse);
  }

  try {
    // ------------------------------------------------
    // Get recent news from FastAPI
    // ------------------------------------------------
    console.log("Fetching news from FastAPI...");

    const newsItems = await fetchNewsFromAPI(text, category);

    console.log(`Received ${newsItems.length} news sources`);

    // ------------------------------------------------
    // Build news context
    // ------------------------------------------------
    const newsContext = newsItems
      .map((item) => {
        return (
          `Headline: ${item.headline || ""}\n` +
          `Description: ${item.description || ""}\n` +
          `Source: ${item.source_link || ""}\n` +
          `Date: ${item.date || ""}`
        );
      })
      .join("\n\n");

    // ------------------------------------------------
    // Sources
    // ------------------------------------------------
    const sources = newsItems.map((item) => item.source_link).filter(Boolean);

    const sourcesText =
      sources.length > 0
        ? `Verified against sources: ${sources.join(", ")}.`
        : "No specific sources available from the news data.";

    // ------------------------------------------------
    // Gemini prompt
    // ------------------------------------------------
    const prompt = `
You are a news verification system.

Analyze the user-submitted news against the provided recent news sources.

First translate the News Content to English if needed.

Then verify the News Content against the provided news context and the specified category.

If the news content does not match the selected category, clearly state that the category is invalid.

Analyze credibility based on:
- Matches with the provided news context
- Source reliability
- Content consistency
- Agreement or disagreement with recent reporting

Include the provided sources in the "sourceandrelated" field.

News Category:
${category}

News Content:
${text}

Recent News Context:
${newsContext || "No recent news data available"}

Respond ONLY with a valid JSON object using exactly this structure:

{
  "trustScore": 0,
  "analysis": "",
  "sourceandrelated": "",
  "summary": "",
  "potentialBiases": [],
  "recommendation": ""
}

Rules:
- trustScore must be a number from 0 to 100.
- analysis must contain 1-2 sentences.
- sourceandrelated must contain 2-4 sentences.
- summary must be a concise 1-3 sentence summary of the submitted news content.
- potentialBiases must be an array containing 1-3 strings.
- recommendation must be a string.
- Do not use Markdown.
- Do not wrap the JSON in code fences.
`;

    // ------------------------------------------------
    // Call Gemini using NEW SDK
    // ------------------------------------------------
    console.log("Sending request to Gemini...");

    let response;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Sending request to Gemini (attempt ${attempt}/3)...`);

        response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: prompt,
          config: {
            temperature: 0,
            topP: 1,
            topK: 1,
            candidateCount: 1,
            responseMimeType: "application/json",
          },
        });

        console.log("Gemini response received");
        break;
      } catch (error) {
        const status = error?.status;

        console.error(
          `Gemini attempt ${attempt} failed:`,
          error?.message || error,
        );

        if (status === 503 && attempt < 3) {
          console.log(
            "Gemini is temporarily unavailable. Retrying in 5 seconds...",
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }

        throw error;
      }
    }

    // ------------------------------------------------
    // Read Gemini response
    // ------------------------------------------------
    let responseText = response.text.trim();

    console.log("Gemini response received");

    // Remove accidental Markdown code fences
    responseText = responseText
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // ------------------------------------------------
    // Parse JSON
    // ------------------------------------------------
    const parsedResponse = JSON.parse(responseText);

    // ------------------------------------------------
    // Validate response
    // ------------------------------------------------
    if (
      typeof parsedResponse.trustScore !== "number" ||
      typeof parsedResponse.analysis !== "string" ||
      typeof parsedResponse.sourceandrelated !== "string" ||
      typeof parsedResponse.summary !== "string" ||
      !Array.isArray(parsedResponse.potentialBiases) ||
      typeof parsedResponse.recommendation !== "string" ||
      parsedResponse.trustScore < 0 ||
      parsedResponse.trustScore > 100
    ) {
      throw new Error("Invalid Gemini response structure");
    }

    // ------------------------------------------------
    // Save result in cache
    // ------------------------------------------------
    verificationCache.set(cacheKey, parsedResponse);

    // ------------------------------------------------
    // Send result to frontend
    // ------------------------------------------------
    return res.status(200).json(parsedResponse);
  } catch (error) {
    console.error("VERIFY NEWS ERROR:", error);

    return res.status(500).json({
      error: `Failed to verify news: ${error.message}`,
    });
  }
});

// --------------------------------------------------
// Start server
// --------------------------------------------------
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
