from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import aiohttp
from bs4 import BeautifulSoup
import logging
from datetime import datetime
from typing import List, Dict, Optional
import asyncio
import urllib.parse
import xml.etree.ElementTree as ET
import re


# =========================================================
# LOGGING
# =========================================================

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)


# =========================================================
# FASTAPI APP
# =========================================================

app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://gemini-server-xi.vercel.app",
        "http://localhost:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# CATEGORIES
# =========================================================

CATEGORIES = [
    "general",
    "education",
    "finance",
    "politics",
    "world",
    "india",
    "tech",
    "entertainment",
    "sports",
    "science"
]


# =========================================================
# INPUT MODEL
# =========================================================

class NewsInput(BaseModel):
    news_text: str
    category: str


# =========================================================
# DATE EXTRACTION
# =========================================================

async def extract_date(soup: BeautifulSoup) -> str:
    """
    Try to extract the article publication date.
    """

    date_tag = (
        soup.find(
            "meta",
            {"property": "article:published_time"}
        )
        or soup.find(
            "meta",
            {"property": "og:published_time"}
        )
        or soup.find("time")
    )

    if date_tag:

        date_str = (
            date_tag.get("content")
            or date_tag.get("datetime")
            or date_tag.get_text(strip=True)
            or ""
        )

        try:

            return datetime.fromisoformat(
                date_str.replace("Z", "+00:00")
            ).strftime("%Y-%m-%d")

        except Exception:
            pass

    return datetime.now().strftime("%Y-%m-%d")


# =========================================================
# HEADLINE EXTRACTION
# =========================================================

def extract_headline(news_text: str) -> str:
    """
    Extract a clean headline from OCR text.
    """

    if not news_text:
        return ""

    # Split original OCR into lines
    lines = [
        line.strip()
        for line in news_text.splitlines()
        if line.strip()
    ]

    meaningful_lines = []

    for line in lines:

        # Count alphabetic characters
        letters = sum(
            1 for char in line
            if char.isalpha()
        )

        # Ignore OCR garbage
        if letters >= 5:

            # Remove excessive spaces
            cleaned = re.sub(
                r"\s+",
                " ",
                line
            ).strip()

            meaningful_lines.append(cleaned)

    # Use first 3 meaningful lines
    headline_lines = meaningful_lines[:3]

    headline = " ".join(
        headline_lines
    ).strip()

    # If extraction failed, use first part of text
    if not headline:

        headline = re.sub(
            r"\s+",
            " ",
            news_text
        ).strip()

    # Limit search length
    headline = headline[:300]

    return headline


# =========================================================
# SEARCH TERM CREATION
# =========================================================

def create_search_queries(
    headline: str,
    category: str
) -> List[str]:
    """
    Create several short, focused queries.
    """

    words = headline.split()

    queries = []

    # -----------------------------------------------------
    # Query 1 - first important words
    # -----------------------------------------------------

    if len(words) >= 8:

        query1 = " ".join(
            words[:8]
        )

    else:

        query1 = headline

    queries.append(query1)

    # -----------------------------------------------------
    # Query 2 - headline + category
    # -----------------------------------------------------

    if category and category != "general":

        queries.append(
            f"{query1} {category}"
        )

    # -----------------------------------------------------
    # Query 3 - first 5 words
    # -----------------------------------------------------

    if len(words) >= 5:

        query3 = " ".join(
            words[:5]
        )

        queries.append(query3)

    # Remove duplicates
    unique_queries = []

    for query in queries:

        query = query.strip()

        if (
            query
            and query not in unique_queries
        ):
            unique_queries.append(query)

    return unique_queries


# =========================================================
# GOOGLE NEWS RSS SEARCH
# =========================================================


# =========================================================
# ARTICLE FETCHING
# =========================================================

async def fetch_url(
    session: aiohttp.ClientSession,
    url: str
) -> Optional[Dict]:
    """
    Fetch an article and extract useful information.
    """

    headers = {
        "User-Agent": (
            "Mozilla/5.0 "
            "(Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 "
            "(KHTML, like Gecko) "
            "Chrome/120.0.0.0 "
            "Safari/537.36"
        )
    }

    try:

        logger.debug(
            f"Fetching article: {url}"
        )

        async with session.get(
            url,
            headers=headers,
            timeout=aiohttp.ClientTimeout(
                total=10
            ),
            allow_redirects=True
        ) as response:

            if response.status != 200:

                logger.debug(
                    f"Article returned "
                    f"status {response.status}: "
                    f"{url}"
                )

                return None

            text = await response.text(
                errors="ignore"
            )

            soup = BeautifulSoup(
                text,
                "html.parser"
            )

            # -------------------------------------------------
            # Headline
            # -------------------------------------------------

            headline = ""

            og_title = soup.find(
                "meta",
                {"property": "og:title"}
            )

            if og_title:

                headline = (
                    og_title.get("content", "")
                    .strip()
                )

            if not headline and soup.title:

                headline = soup.title.get_text(
                    strip=True
                )

            if not headline:

                headline = url

            headline = headline[:200]

            # -------------------------------------------------
            # Description
            # -------------------------------------------------

            description = ""

            desc_tag = (
                soup.find(
                    "meta",
                    {"name": "description"}
                )
                or soup.find(
                    "meta",
                    {"property": "og:description"}
                )
            )

            if desc_tag:

                description = (
                    desc_tag.get(
                        "content",
                        ""
                    )
                    .strip()
                )

            if not description:

                paragraph = soup.find("p")

                if paragraph:

                    description = (
                        paragraph.get_text(
                            " ",
                            strip=True
                        )
                    )

            description = description[:500]

            # -------------------------------------------------
            # Date
            # -------------------------------------------------

            date = await extract_date(
                soup
            )

            # -------------------------------------------------
            # Final result
            # -------------------------------------------------

            result = {
                "headline": headline,
                "description": description,
                "source_link": str(
                    response.url
                ),
                "date": date
            }

            logger.debug(
                f"Successfully fetched: "
                f"{headline[:100]}"
            )

            return result

    except asyncio.TimeoutError:

        logger.debug(
            f"Article timeout: {url}"
        )

        return None

    except Exception as e:

        logger.debug(
            f"Article fetch failed: "
            f"{url} - {e}"
        )

        return None


# =========================================================
# RELEVANCE CHECK
# =========================================================

def calculate_relevance(
    headline: str,
    result: Dict
) -> int:
    """
    Calculate simple keyword relevance.
    """

    # Important words from the claim headline
    headline_words = {
        word.lower().strip(
            ".,!?():;\"'[]{}"
        )
        for word in headline.split()
        if len(word) >= 4
    }

    article_text = (
        f"{result.get('headline', '')} "
        f"{result.get('description', '')}"
    ).lower()

    matching_words = 0

    for word in headline_words:

        if word in article_text:

            matching_words += 1

    return matching_words


# =========================================================
# GET NEWS RESULTS
# =========================================================

async def google_news_search(query: str) -> List[Dict]:
    """
    Search Google News RSS and return structured news results.
    """

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 "
            "(KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "application/rss+xml, application/xml, text/xml"
    }

    try:

        encoded_query = urllib.parse.quote_plus(query)

        url = (
            "https://news.google.com/rss/search"
            f"?q={encoded_query}"
            "&hl=en-IN"
            "&gl=IN"
            "&ceid=IN:en"
        )

        logger.debug(
            f"Searching Google News: {query}"
        )

        async with aiohttp.ClientSession() as session:

            async with session.get(
                url,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=15)
            ) as response:

                logger.debug(
                    f"Google News status: {response.status}"
                )

                if response.status != 200:
                    logger.error(
                        f"Google News returned status "
                        f"{response.status}"
                    )
                    return []

                xml_text = await response.text(
                    errors="ignore"
                )

                root = ET.fromstring(xml_text)

                results = []

                for item in root.findall(".//item"):

                    title_element = item.find("title")
                    link_element = item.find("link")
                    description_element = item.find(
                        "description"
                    )
                    date_element = item.find(
                        "pubDate"
                    )
                    source_element = item.find(
                        "source"
                    )

                    title = (
                        title_element.text.strip()
                        if title_element is not None
                        and title_element.text
                        else ""
                    )

                    link = (
                        link_element.text.strip()
                        if link_element is not None
                        and link_element.text
                        else ""
                    )

                    description = (
                        description_element.text.strip()
                        if description_element is not None
                        and description_element.text
                        else ""
                    )

                    pub_date = (
                        date_element.text.strip()
                        if date_element is not None
                        and date_element.text
                        else ""
                    )

                    publisher = (
                        source_element.text.strip()
                        if source_element is not None
                        and source_element.text
                        else "Unknown source"
                    )

                    publisher_url = ""

                    if source_element is not None:
                        publisher_url = (
                            source_element.get("url", "")
                        )

                    if not title or not link:
                        continue

                    result = {
                        "headline": title,
                        "description": BeautifulSoup(
                            description,
                            "html.parser"
                        ).get_text(
                            " ",
                            strip=True
                        )[:500],
                        "source_link": link,
                        "publisher": publisher,
                        "publisher_url": publisher_url,
                        "date": pub_date
                    }

                    results.append(result)

                    logger.debug(
                        f"Found source: "
                        f"{publisher} | {title}"
                    )

                logger.info(
                    f"Google News found "
                    f"{len(results)} articles"
                )

                return results[:10]

    except ET.ParseError as e:

        logger.error(
            f"Google News XML parsing failed: {e}"
        )

        return []

    except asyncio.TimeoutError:

        logger.error(
            "Google News request timed out"
        )

        return []

    except Exception as e:

        logger.error(
            f"Google News search failed: {e}"
        )

        return []


async def get_news_results(
    news_text: str,
    category: str
) -> List[Dict]:
    """
    Find relevant news sources using the OCR headline.
    """

    if category not in CATEGORIES:

        raise HTTPException(
            status_code=400,
            detail="Invalid category"
        )

    # =====================================================
    # Extract headline
    # =====================================================

    headline = extract_headline(
        news_text
    )

    logger.info(
        f"Detected headline: {headline}"
    )

    if not headline:

        logger.warning(
            "Could not extract headline"
        )

        return []

    # =====================================================
    # Create focused search queries
    # =====================================================

    words = headline.split()

    queries = []

    # Main query
    if len(words) > 8:

        queries.append(
            " ".join(words[:8])
        )

    else:

        queries.append(
            headline
        )

    # Shorter query
    if len(words) >= 5:

        queries.append(
            " ".join(words[:5])
        )

    # Remove duplicate queries
    queries = list(
        dict.fromkeys(queries)
    )

    logger.info(
        f"Search queries: {queries}"
    )

    # =====================================================
    # Search Google News
    # =====================================================

    all_results = []

    for query in queries:

        results = await google_news_search(
            query
        )

        logger.info(
            f"Query returned "
            f"{len(results)} articles: "
            f"{query}"
        )

        for result in results:

            # Avoid duplicate articles
            existing_links = {
                item["source_link"]
                for item in all_results
            }

            if result["source_link"] not in existing_links:

                all_results.append(
                    result
                )

    # =====================================================
    # No results
    # =====================================================

    if not all_results:

        logger.warning(
            "No news sources found"
        )

        return []

    logger.info(
        f"Total unique articles: "
        f"{len(all_results)}"
    )

    # =====================================================
    # Relevance calculation
    # =====================================================

    headline_words = {
        word.lower().strip(
            ".,!?():;\"'[]{}"
        )
        for word in headline.split()
        if len(word) >= 4
    }

    relevant_results = []

    for result in all_results:

        article_text = (
            f"{result.get('headline', '')} "
            f"{result.get('description', '')}"
        ).lower()

        matching_words = 0

        for word in headline_words:

            if word in article_text:

                matching_words += 1

        result["relevance_score"] = (
            matching_words
        )

        if matching_words >= 2:

            relevant_results.append(
                result
            )

            logger.info(
                f"Relevant source: "
                f"{result.get('publisher', 'Unknown')} "
                f"| matches: {matching_words}"
            )

        else:

            logger.debug(
                f"Rejected source: "
                f"{result.get('publisher', 'Unknown')} "
                f"| matches: {matching_words}"
            )

    # =====================================================
    # Sort
    # =====================================================

    relevant_results.sort(
        key=lambda x: (
            x.get("relevance_score", 0),
            x.get("date", "")
        ),
        reverse=True
    )

    logger.info(
        f"Returning "
        f"{len(relevant_results)} "
        f"relevant sources"
    )

    return relevant_results[:8]

# =========================================================
# ANALYZE API
# =========================================================

@app.post(
    "/api/analyze",
    response_class=JSONResponse
)
async def analyze_news(
    news_input: NewsInput
):

    try:

        logger.info(
            "Received news analysis request"
        )

        results = await get_news_results(
            news_input.news_text,
            news_input.category
        )

        return JSONResponse(
            content={
                "results": results
            }
        )

    except HTTPException:

        raise

    except Exception as e:

        logger.exception(
            f"Analysis failed: {e}"
        )

        return JSONResponse(
            content={
                "error": "Internal server error"
            },
            status_code=500
        )


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
async def health_check():

    return {
        "status": "ok"
    }


# =========================================================
# ROOT
# =========================================================

@app.get("/")
async def root():

    return {
        "status": "ok",
        "service": "News Verification API"
    }


# =========================================================
# LOCAL RUN
# =========================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=10000
    )