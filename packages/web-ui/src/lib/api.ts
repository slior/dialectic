/**
 * API client utilities for making REST API calls to the debate server.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Builds the base URL for debate API endpoints.
 * 
 * @param debateId - The debate ID.
 * @returns The base URL for the debate endpoint.
 */
function getDebateUrl(debateId: string): string {
  return `${API_URL}/api/debates/${debateId}`;
}

/**
 * Attempts to extract an error message from a response text.
 * If the response is valid JSON with a message property, returns that message.
 * Otherwise, returns undefined.
 * 
 * @param errorText - The error response text from the server.
 * @returns The error message if found, undefined otherwise.
 */
function extractErrorMessage(errorText: string): string | undefined {
  try {
    const errorJson = JSON.parse(errorText);
    return errorJson.message;
  } catch {
    // Response is not valid JSON, return undefined to use default error message
    return undefined;
  }
}

/**
 * Submits user feedback for a completed debate.
 * 
 * @param debateId - The debate ID.
 * @param feedback - The feedback value: 1 for positive (thumb-up), -1 for negative (thumb-down).
 * @throws {Error} If the API request fails.
 */
export async function submitFeedback(debateId: string, feedback: number): Promise<void> {
  const response = await fetch(`${getDebateUrl(debateId)}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ feedback }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const errorMessage = extractErrorMessage(errorText) || `Failed to submit feedback: ${response.status} ${response.statusText}`;
    throw new Error(errorMessage);
  }
}

/**
 * Downloads the complete debate JSON file.
 * Opens the file in a new browser tab/window.
 * 
 * @param debateId - The debate ID.
 * @throws {Error} If the API request fails.
 */
export async function downloadDebate(debateId: string): Promise<void> {
  const response = await fetch(`${getDebateUrl(debateId)}/download`);

  if (!response.ok) {
    const errorText = await response.text();
    const errorMessage = extractErrorMessage(errorText) || `Failed to download debate: ${response.status} ${response.statusText}`;
    throw new Error(errorMessage);
  }

  // Get the JSON data
  const jsonData = await response.json();
  
  // Create a blob and download it
  const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${debateId}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

