chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "verify-selected-news",
    title: "Verify selected news",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (
    info.menuItemId !== "verify-selected-news" ||
    !info.selectionText
  ) {
    return;
  }

  const selectedText = info.selectionText.trim();

  // Save selected news text
  await chrome.storage.local.set({
    selectedNewsText: selectedText
  });

  // Open the extension result page
  chrome.tabs.create({
    url: chrome.runtime.getURL("popup.html")
  });
});