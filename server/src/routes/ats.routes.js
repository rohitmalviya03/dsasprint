import express from 'express';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.use(requireAuth);

function normalizeWords(value) {
  return String(value || '').toLowerCase().match(/[a-z][a-z0-9+#.-]{1,}/g) || [];
}

function topKeywords(text, limit = 28) {
  const stopWords = new Set(['and', 'the', 'for', 'with', 'from', 'that', 'this', 'you', 'your', 'are', 'will', 'have', 'has', 'was', 'were', 'our', 'their', 'role', 'work', 'team', 'using', 'use', 'including', 'such', 'into', 'about', 'must', 'should', 'years', 'experience']);
  const counts = new Map();
  for (const word of normalizeWords(text)) {
    if (word.length < 3 || stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, limit).map(([word]) => word);
}

function sectionCheck(resume, label, patterns) {
  return { label, found: patterns.some((pattern) => pattern.test(resume)) };
}

function analyzeAtsResume(resumeText, jobText) {
  const resume = resumeText.toLowerCase();
  const jobKeywords = topKeywords(jobText || resumeText, 32);
  const resumeWords = new Set(normalizeWords(resumeText));
  const matched = jobKeywords.filter((keyword) => resumeWords.has(keyword));
  const missing = jobKeywords.filter((keyword) => !resumeWords.has(keyword));
  const sections = [
    sectionCheck(resume, 'Contact details', [/@/, /\+?\d[\d\s-]{7,}/, /linkedin\.com/i]),
    sectionCheck(resume, 'Skills', [/\bskills\b/, /technical skills/, /technologies/]),
    sectionCheck(resume, 'Experience', [/\bexperience\b/, /employment/, /work history/]),
    sectionCheck(resume, 'Projects', [/\bprojects?\b/, /portfolio/]),
    sectionCheck(resume, 'Education', [/\beducation\b/, /degree/, /university/, /college/])
  ];
  const actionVerbs = ['built', 'developed', 'designed', 'optimized', 'implemented', 'deployed', 'improved', 'reduced', 'increased', 'automated', 'led'];
  const hasMetrics = /\b\d+%|\b\d+x|\b\d+\+|\b\d+ users|\b\d+ ms|\b\d+ seconds|\b\d+ projects/i.test(resumeText);
  const verbCount = actionVerbs.filter((verb) => resumeWords.has(verb)).length;
  const keywordScore = jobKeywords.length ? Math.round((matched.length / jobKeywords.length) * 45) : 28;
  const sectionScore = sections.filter((section) => section.found).length * 7;
  const impactScore = Math.min(20, (hasMetrics ? 10 : 0) + Math.min(10, verbCount * 2));
  const lengthScore = resumeText.length > 1200 && resumeText.length < 9000 ? 10 : resumeText.length >= 600 ? 6 : 2;
  const score = Math.min(100, keywordScore + sectionScore + impactScore + lengthScore);
  const suggestions = [];
  if (missing.length) suggestions.push(`Add important job keywords naturally: ${missing.slice(0, 8).join(', ')}.`);
  if (!hasMetrics) suggestions.push('Add measurable impact: percentages, user count, latency, revenue, time saved, or scale.');
  if (verbCount < 4) suggestions.push('Start more bullet points with strong action verbs like built, optimized, deployed, improved, or automated.');
  for (const section of sections.filter((item) => !item.found)) suggestions.push(`Add a clear ${section.label} section heading.`);
  if (resumeText.length < 1200) suggestions.push('Resume text looks short. Add project details, responsibilities, tools, and outcomes.');
  return { score, matched, missing, sections, suggestions: suggestions.slice(0, 7), keywordCount: jobKeywords.length };
}

async function extractPdfText(file) {
  const parser = new PDFParse({ data: file.buffer });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy();
  }
}

async function extractResumeText(file, fallbackText) {
  if (!file) return fallbackText || '';
  const name = file.originalname || '';
  const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(name);
  const isText = file.mimetype.startsWith('text/') || /\.(txt|md|text)$/i.test(name);
  if (isPdf) return extractPdfText(file);
  if (isText) return file.buffer.toString('utf8');
  const error = new Error('Upload a PDF, TXT, or MD resume file.');
  error.statusCode = 400;
  throw error;
}

router.post('/check', upload.single('resume'), asyncHandler(async (req, res) => {
  const parsed = z.object({
    resume_text: z.string().max(120000).optional().default(''),
    job_text: z.string().max(120000).optional().default('')
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid ATS checker input.' });
  const resumeText = (await extractResumeText(req.file, parsed.data.resume_text)).trim();
  if (resumeText.length < 300) {
    return res.status(400).json({ message: 'Could not extract enough resume text. Upload a text-based PDF or paste resume text manually.' });
  }
  res.json({ result: analyzeAtsResume(resumeText, parsed.data.job_text), extracted_text: resumeText });
}));

export default router;