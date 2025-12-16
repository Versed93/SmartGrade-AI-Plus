import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Rubric } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Schema definitions for structured output
const rubricSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Title of the rubric" },
    description: { type: Type.STRING, description: "Short description of the assignment" },
    criteria: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Criterion title, e.g., 'Clarity'" },
          description: { type: Type.STRING, description: "What this criterion measures" },
          weight: { type: Type.NUMBER, description: "Weight of this criterion (default 1)" },
          levels: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING, description: "Level name (e.g., Excellent)" },
                score: { type: Type.NUMBER, description: "Points for this level" },
                description: { type: Type.STRING, description: "Description of performance at this level" }
              },
              required: ["label", "score", "description"]
            }
          }
        },
        required: ["title", "description", "levels", "weight"]
      }
    }
  },
  required: ["title", "criteria", "description"]
};

// Schema for grading result
const gradingSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    ratings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          criterionTitle: { type: Type.STRING, description: "The exact title of the criterion from the rubric" },
          levelLabel: { type: Type.STRING, description: "The exact label of the selected level" },
          explanation: { type: Type.STRING, description: "Why this level was chosen" }
        },
        required: ["criterionTitle", "levelLabel"]
      }
    },
    feedback: { type: Type.STRING, description: "Overall feedback for the student" }
  },
  required: ["ratings", "feedback"]
};

// Helper function to enrich raw JSON with IDs
const enrichRubricData = (data: any): Partial<Rubric> => {
  return {
    ...data,
    id: crypto.randomUUID(),
    criteria: data.criteria.map((c: any) => ({
      ...c,
      id: crypto.randomUUID(),
      levels: c.levels.map((l: any) => ({
        ...l,
        id: crypto.randomUUID()
      }))
    }))
  };
};

export const generateRubricWithAI = async (
    topic: string, 
    gradeLevel: string, 
    context?: { brief?: string, plos?: string[], clos?: string[] },
    numCriteria: number = 4
): Promise<Partial<Rubric>> => {
  try {
    let prompt = `Create a grading rubric for a "${topic}" assignment for ${gradeLevel} students. 
    It should have approximately ${numCriteria} main criteria. 
    Each criterion should have 4 levels of performance (e.g., Excellent, Good, Fair, Needs Improvement).`;

    if (context) {
        prompt += `\n\nEnsure the rubric aligns with the following context:`;
        
        if (context.brief) {
            prompt += `\n\nAssignment Brief:\n"${context.brief}"`;
        }
        
        if (context.plos && context.plos.length > 0) {
            prompt += `\n\nProgram Learning Outcomes (PLOs):\n${context.plos.map(p => `- ${p}`).join('\n')}`;
        }
        
        if (context.clos && context.clos.length > 0) {
            prompt += `\n\nCourse Learning Outcomes (CLOs):\n${context.clos.map(c => `- ${c}`).join('\n')}`;
        }

        prompt += `\n\nThe criteria must explicitly address the learning outcomes and the requirements in the brief.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: rubricSchema,
        systemInstruction: "You are an expert pedagogical consultant helping teachers create fair, aligned, and detailed rubrics based on specific learning outcomes."
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const data = JSON.parse(text);
    return enrichRubricData(data);

  } catch (error) {
    console.error("Error generating rubric:", error);
    throw error;
  }
};

export const extractRubricFromMedia = async (base64Data: string, mimeType: string): Promise<Partial<Rubric>> => {
  try {
    const prompt = "Analyze this document and extract the grading rubric into a structured JSON format. Identify the title, description, criteria, weight, and detailed performance levels (label, score, description) for each criterion.";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: rubricSchema,
        systemInstruction: "You are an expert pedagogical consultant helping teachers digitize their existing rubrics."
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const data = JSON.parse(text);
    return enrichRubricData(data);

  } catch (error) {
    console.error("Error extracting rubric:", error);
    throw error;
  }
};

export const extractSubmissionText = async (base64Data: string, mimeType: string): Promise<string> => {
  try {
    const prompt = "Extract all readable text from this document. Return only the text content.";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt }
        ]
      }
    });

    return response.text || "";
  } catch (error) {
    console.error("Error extracting text:", error);
    throw error;
  }
};

export const generateFeedbackWithAI = async (
  assigneeName: string,
  rubricTitle: string,
  criteriaResults: { criterion: string; level: string; description: string }[]
): Promise<string> => {
  try {
    const inputs = criteriaResults.map(c => 
      `- ${c.criterion}: ${c.level} (${c.description})`
    ).join('\n');

    const prompt = `Write constructive, encouraging, and specific feedback for student "${assigneeName}" for the assignment "${rubricTitle}".
    
    Here is their performance breakdown:
    ${inputs}
    
    Keep the tone professional yet supportive. Address the student directly (2nd person). Limit to 100 words.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || "Could not generate feedback.";
  } catch (error) {
    console.error("Error generating feedback:", error);
    return "Error generating AI feedback.";
  }
};

export const autoGradeWithAI = async (
  rubric: Rubric,
  submissionText: string
): Promise<{ ratings: { criterionTitle: string; levelLabel: string; explanation?: string }[]; feedback: string }> => {
  try {
    const rubricContext = {
      title: rubric.title,
      criteria: rubric.criteria.map(c => ({
        title: c.title,
        description: c.description,
        levels: c.levels.map(l => ({ label: l.label, description: l.description }))
      }))
    };

    const prompt = `You are a fair and strict grader. Evaluate the student submission based on the following rubric.
    
    Rubric:
    ${JSON.stringify(rubricContext, null, 2)}
    
    Student Submission:
    "${submissionText}"
    
    For each criterion, select the Level Label that best matches the submission quality. Provide a brief explanation. Also provide overall feedback.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: gradingSchema
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    return JSON.parse(text);
  } catch (error) {
    console.error("Error auto-grading:", error);
    throw error;
  }
};
