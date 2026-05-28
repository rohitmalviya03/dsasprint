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

const STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'from', 'that', 'this', 'you', 'your', 'are', 'will', 'have', 'has', 'was', 'were', 'our', 'their', 'role', 'work', 'team', 'using', 'use', 'including', 'such', 'into', 'about', 'must', 'should', 'years', 'experience', 'candidate', 'responsibilities', 'requirements', 'preferred', 'strong', 'good', 'excellent']);
const ACTION_VERBS = ['built', 'developed', 'designed', 'optimized', 'implemented', 'deployed', 'improved', 'reduced', 'increased', 'automated', 'led', 'launched', 'migrated', 'owned', 'architected', 'integrated', 'delivered', 'created'];
const SKILL_BANK = ['javascript', 'typescript', 'react', 'node.js', 'node', 'express', 'mysql', 'postgresql', 'mongodb', 'redis', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'ci/cd', 'git', 'rest', 'graphql', 'html', 'css', 'tailwind', 'python', 'java', 'spring', 'c++', 'c#', 'sql', 'data structures', 'algorithms', 'system design', 'microservices', 'api', 'apis', 'testing', 'jest', 'linux', 'devops', 'machine learning', 'leadership', 'communication', 'agile'];
const ROLE_PATTERNS = [
  'frontend developer', 'front end developer', 'backend developer', 'full stack developer', 'software engineer', 'web developer', 'react developer', 'node.js developer', 'java developer', 'python developer', 'data analyst', 'data scientist', 'devops engineer', 'qa engineer', 'mobile developer', 'android developer', 'ios developer'
];

router.use(requireAuth);

function normalizeText(value) {
  return String(value || '').replace(/\r/g, '').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeWords(value) {
  return String(value || '').toLowerCase().match(/[a-z][a-z0-9+#./-]{1,}/g) || [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(text, phrase) {
  return new RegExp(`(^|[^a-z0-9+#./-])${escapeRegExp(phrase)}([^a-z0-9+#./-]|$)`, 'i').test(text);
}

function keywordCandidates(jobText) {
  const text = jobText.toLowerCase();
  const words = normalizeWords(text).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  const counts = new Map();
  for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  for (const skill of SKILL_BANK) {
    if (containsPhrase(text, skill)) counts.set(skill, (counts.get(skill) || 0) + 3);
  }
  const phrases = [];
  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const phrase = words.slice(index, index + size).join(' ');
      if (phrase.length > 8 && !phrase.split(' ').some((part) => STOP_WORDS.has(part))) phrases.push(phrase);
    }
  }
  for (const phrase of phrases) counts.set(phrase, (counts.get(phrase) || 0) + 2);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 36)
    .map(([word, count]) => ({ word, importance: count >= 4 ? 'High' : count >= 2 ? 'Medium' : 'Low' }));
}

function inferTargetRoles(jobText) {
  const text = jobText.toLowerCase();
  return ROLE_PATTERNS.filter((role) => containsPhrase(text, role)).slice(0, 4);
}

function sectionCheck(resume, label, patterns, weight) {
  const found = patterns.some((pattern) => pattern.test(resume));
  return { label, found, score: found ? weight : 0, max: weight, details: found ? 'Detected' : 'Missing or unclear' };
}

function contactSignals(resumeText) {
  return {
    email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(resumeText),
    phone: /\+?\d[\d\s().-]{7,}\d/.test(resumeText),
    linkedin: /linkedin\.com\//i.test(resumeText),
    github: /github\.com\//i.test(resumeText),
    portfolio: /(https?:\/\/)?(www\.)?[a-z0-9-]+\.(dev|io|me|com|in)\b/i.test(resumeText)
  };
}

function formattingSignals(resumeText, extractedFromPdf) {
  const longLines = resumeText.split('\n').filter((line) => line.trim().length > 150).length;
  const symbolNoise = (resumeText.match(/[|?¦??]/g) || []).length;
  const hasTablesRisk = /\btable\b|\bcolumns?\b/i.test(resumeText) || longLines > 8;
  return [
    { label: 'Readable text extraction', ok: resumeText.length >= 600, message: resumeText.length >= 600 ? 'Enough machine-readable text found.' : 'Resume text is too short for reliable ATS parsing.' },
    { label: 'PDF parser compatibility', ok: !extractedFromPdf || resumeText.length >= 600, message: extractedFromPdf ? 'Text-based PDF parsed successfully.' : 'Text input provided.' },
    { label: 'Simple layout', ok: !hasTablesRisk, message: hasTablesRisk ? 'Avoid tables, multiple columns, or very long lines.' : 'No obvious table/column risk detected.' },
    { label: 'Low symbol noise', ok: symbolNoise < 10, message: symbolNoise < 10 ? 'Decorative symbols look limited.' : 'Too many decorative symbols can confuse ATS parsers.' }
  ];
}

function scoreBand(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 72) return 'Strong';
  if (score >= 58) return 'Needs improvement';
  return 'High risk';
}

function analyzeAtsResume(resumeText, jobText, { extractedFromPdf = false } = {}) {
  const cleanResume = normalizeText(resumeText);
  const resumeLower = cleanResume.toLowerCase();
  const resumeWords = new Set(normalizeWords(cleanResume));
  const hasJob = normalizeText(jobText).length >= 120;
  const keywords = keywordCandidates(hasJob ? jobText : cleanResume);
  const matched = keywords.filter((item) => containsPhrase(resumeLower, item.word));
  const missing = keywords.filter((item) => !containsPhrase(resumeLower, item.word));
  const targetRoles = inferTargetRoles(jobText || cleanResume);
  const roleMatches = targetRoles.filter((role) => containsPhrase(resumeLower, role));
  const sections = [
    sectionCheck(resumeLower, 'Contact details', [/@/, /\+?\d[\d\s().-]{7,}\d/, /linkedin\.com\//i], 4),
    sectionCheck(resumeLower, 'Professional summary', [/\bsummary\b/, /\bprofile\b/, /objective/], 3),
    sectionCheck(resumeLower, 'Skills', [/\bskills\b/, /technical skills/, /technologies/, /tools/], 4),
    sectionCheck(resumeLower, 'Experience', [/\bexperience\b/, /employment/, /work history/, /professional experience/], 5),
    sectionCheck(resumeLower, 'Projects', [/\bprojects?\b/, /portfolio/], 3),
    sectionCheck(resumeLower, 'Education', [/\beducation\b/, /degree/, /university/, /college/], 3)
  ];
  const contacts = contactSignals(cleanResume);
  const formatting = formattingSignals(cleanResume, extractedFromPdf);
  const metricCount = (cleanResume.match(/\b\d+%|\b\d+x|\b\d+\+|\b\d+ users|\b\d+ ms|\b\d+ seconds|\b\d+ projects|\$\d+/gi) || []).length;
  const bulletCount = (cleanResume.match(/^\s*[-*•]/gm) || []).length;
  const actionVerbCount = ACTION_VERBS.filter((verb) => resumeWords.has(verb)).length;
  const wordCount = normalizeWords(cleanResume).length;
  const keywordScore = hasJob ? Math.round((matched.length / Math.max(1, keywords.length)) * 35) : 22;
  const roleScore = targetRoles.length ? Math.round((roleMatches.length / targetRoles.length) * 10) : 6;
  const sectionScore = sections.reduce((total, section) => total + section.score, 0);
  const contactScore = Object.values(contacts).filter(Boolean).length >= 3 ? 10 : Object.values(contacts).filter(Boolean).length * 3;
  const impactScore = Math.min(15, (metricCount >= 4 ? 9 : metricCount * 2) + Math.min(6, actionVerbCount));
  const formatScore = formatting.filter((item) => item.ok).length * 2.5;
  const lengthScore = wordCount >= 350 && wordCount <= 1100 ? 8 : wordCount >= 220 ? 5 : 2;
  const score = Math.min(100, Math.round(keywordScore + roleScore + sectionScore + contactScore + impactScore + formatScore + lengthScore));
  const breakdown = [
    { label: 'Job keyword match', score: keywordScore, max: 35 },
    { label: 'Role alignment', score: roleScore, max: 10 },
    { label: 'ATS sections', score: sectionScore, max: 22 },
    { label: 'Contact/profile signals', score: contactScore, max: 10 },
    { label: 'Measurable impact', score: impactScore, max: 15 },
    { label: 'Parser formatting', score: Math.round(formatScore), max: 10 },
    { label: 'Resume length', score: lengthScore, max: 8 }
  ];
  const suggestions = [];
  if (!hasJob) suggestions.push({ priority: 'High', title: 'Paste the target job description', detail: 'A real ATS match score needs a job description. Without it, the report can only grade structure and generic keywords.' });
  if (missing.length) suggestions.push({ priority: 'High', title: 'Close keyword gaps', detail: `Add truthful evidence for: ${missing.slice(0, 10).map((item) => item.word).join(', ')}.` });
  if (targetRoles.length && !roleMatches.length) suggestions.push({ priority: 'High', title: 'Align the headline with the target role', detail: `Use a clear title like ${targetRoles[0]} near the top if it matches your profile.` });
  for (const section of sections.filter((item) => !item.found)) suggestions.push({ priority: 'Medium', title: `Add ${section.label}`, detail: `Use a standard heading named "${section.label}" so ATS parsers can classify the content.` });
  if (metricCount < 3) suggestions.push({ priority: 'Medium', title: 'Quantify achievements', detail: 'Add numbers to bullets: performance gains, users served, time saved, accuracy, revenue, or project scale.' });
  if (actionVerbCount < 5) suggestions.push({ priority: 'Medium', title: 'Strengthen bullet starts', detail: 'Start bullets with verbs like built, optimized, deployed, automated, led, delivered, or improved.' });
  for (const issue of formatting.filter((item) => !item.ok)) suggestions.push({ priority: 'Low', title: issue.label, detail: issue.message });

  return {
    score,
    rating: scoreBand(score),
    summary: score >= 72 ? 'Your resume is ATS-friendly for this role, with a few optimization gaps.' : 'Your resume needs stronger ATS alignment before applying.',
    breakdown,
    matched: matched.slice(0, 24),
    missing: missing.slice(0, 24),
    keywordCount: keywords.length,
    sections,
    contacts,
    formatting,
    targetRoles,
    roleMatches,
    readability: { wordCount, bulletCount, actionVerbCount, metricCount },
    suggestions: suggestions.slice(0, 10)
  };
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
  if (!file) return { text: fallbackText || '', extractedFromPdf: false };
  const name = file.originalname || '';
  const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(name);
  const isText = file.mimetype.startsWith('text/') || /\.(txt|md|text)$/i.test(name);
  if (isPdf) return { text: await extractPdfText(file), extractedFromPdf: true };
  if (isText) return { text: file.buffer.toString('utf8'), extractedFromPdf: false };
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
  const extracted = await extractResumeText(req.file, parsed.data.resume_text);
  const resumeText = extracted.text.trim();
  if (resumeText.length < 300) {
    return res.status(400).json({ message: 'Could not extract enough resume text. Upload a text-based PDF or paste resume text manually.' });
  }
  res.json({ result: analyzeAtsResume(resumeText, parsed.data.job_text, extracted), extracted_text: resumeText });
}));

export default router;