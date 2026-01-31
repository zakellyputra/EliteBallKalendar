// Bear1 API client for context compression

const BEAR1_BASE_URL = process.env.BEAR1_BASE_URL || 'https://api.bear1.ai';
const BEAR1_API_KEY = process.env.BEAR1_API_KEY;

interface CompressResponse {
  compressed: string;
  originalLength: number;
  compressedLength: number;
}

export async function compressContext(text: string): Promise<CompressResponse> {
  // If no API key, return text as-is (for development)
  if (!BEAR1_API_KEY) {
    console.log('[Bear1] No API key configured, skipping compression');
    return {
      compressed: text,
      originalLength: text.length,
      compressedLength: text.length,
    };
  }

  try {
    const response = await fetch(`${BEAR1_BASE_URL}/compress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BEAR1_API_KEY}`,
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error('[Bear1] Compression failed:', response.status, response.statusText);
      // Fall back to original text
      return {
        compressed: text,
        originalLength: text.length,
        compressedLength: text.length,
      };
    }

    const data = await response.json();
    
    return {
      compressed: data.compressed || text,
      originalLength: text.length,
      compressedLength: (data.compressed || text).length,
    };
  } catch (error) {
    console.error('[Bear1] Compression error:', error);
    // Fall back to original text
    return {
      compressed: text,
      originalLength: text.length,
      compressedLength: text.length,
    };
  }
}
