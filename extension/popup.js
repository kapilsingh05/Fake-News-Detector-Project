const API_URL = "http://localhost:3000/verify-news";

const newsText = document.getElementById("newsText");
const category = document.getElementById("category");
const verifyButton = document.getElementById("verifyButton");
const status = document.getElementById("status");
const results = document.getElementById("results");

const trustScore = document.getElementById("trustScore");
const analysis = document.getElementById("analysis");
const sources = document.getElementById("sources");
const biases = document.getElementById("biases");
const recommendation = document.getElementById("recommendation");

function showStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? "#dc2626" : "#475569";
}

async function loadSelectedText() {
  try {
    const stored = await chrome.storage.local.get("selectedNewsText");

    if (stored.selectedNewsText) {
      newsText.value = stored.selectedNewsText;
      await chrome.storage.local.remove("selectedNewsText");
      return;
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id) return;

    const response = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || ""
    });

    const selected = response?.[0]?.result?.trim();

    if (selected) {
      newsText.value = selected;
    }
  } catch (error) {
    console.log("Could not read selected text:", error);
  }
}

async function verifyNews() {
  const text = newsText.value.trim();
  const selectedCategory = category.value;

  if (!text) {
    showStatus("Please select or enter some news text.", true);
    return;
  }

  verifyButton.disabled = true;
  results.classList.add("hidden");
  showStatus("Verifying news...");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        category: selectedCategory
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Server error: ${response.status}`);
    }

    trustScore.textContent = `${data.trustScore}%`;
    analysis.textContent = data.analysis || "No analysis available.";
    sources.textContent = data.sourceandrelated || "No sources available.";
    recommendation.textContent = data.recommendation || "No recommendation available.";

    biases.innerHTML = "";

    if (Array.isArray(data.potentialBiases)) {
      data.potentialBiases.forEach((bias) => {
        const li = document.createElement("li");
        li.textContent = bias;
        biases.appendChild(li);
      });
    }

    results.classList.remove("hidden");
    showStatus("Verification completed.");
  } catch (error) {
    console.error(error);
    showStatus(
      error instanceof Error
        ? error.message
        : "Could not connect to the verification server.",
      true
    );
  } finally {
    verifyButton.disabled = false;
  }
}

verifyButton.addEventListener("click", verifyNews);

loadSelectedText();
