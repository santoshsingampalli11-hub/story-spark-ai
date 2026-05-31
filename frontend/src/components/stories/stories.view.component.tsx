import React, { useEffect, useState, useRef, useMemo } from "react";
import { getShortenedText, ITopicData, topicsData, getWordCount, SELECTED_TOPIC_CLASSES } from "./stories.utils";
import toast, { Toaster } from "react-hot-toast";
import { useCreatePostMutation, useDeletePostMutation } from "../../redux/apis/post.api";
import { useGetProfileInfoQuery } from "../../redux/apis/user.api";
import jsPDF from "jspdf";
import StoryWorldMap from "../story-map/StoryWorldMap";
import StoryRemix from "../remix/StoryRemix";
import StoryTranslator from "../translate/StoryTranslator";
import BookmarkButton from "../BookmarkButton";
import logo from "../../assets/logoNew.png";
import StoryGeneratingAnimation from "../loading/story-generating-animation.component";
import AudioPlayer, { type AudioPlayerHandle, type NarrationPlaybackState } from "../AudioPlayer";
import { useLocation } from "react-router-dom";
import { useDispatch } from "react-redux";
import { setStory } from "../../redux/slices/storySlice";
import ContinueStoryButton from "../story/ContinueStoryButton";
import { ErrorToast } from "../ErrorToast";
import { useApiError } from "../../hooks/useApiError";
import {
  useGenerateAlternateEndingsMutation,
  useGenerateFreeAlternateEndingsMutation,
} from "../../redux/apis/ai.model.api";

// ─── Custom API Error Handlers ──────────────────────────────────────────────

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return "The AI service is currently busy. Please wait a moment and try again.";
    }
    if ([502, 503, 504].includes(error.status)) {
      return "The server took too long to respond. Please try again shortly.";
    }
    if (error.status >= 500) {
      return "A server error occurred. Please try again later.";
    }
  }
  if (error instanceof TypeError) {
    return "Could not reach the server. Please check your connection and try again.";
  }
  return "An unexpected error occurred. Please try again.";
}

// ─── StoryCoverImage Component ──────────────────────────────────────────────

const GENRE_THEMES: Record<string, { gradient: string; accent: string; icon: string }> = {
  fantasy:     { gradient: "135deg, #667eea 0%, #764ba2 50%, #f093fb 100%", accent: "#c084fc", icon: "✦" },
  romance:     { gradient: "135deg, #f857a6 0%, #ff5858 50%, #ffb347 100%", accent: "#fb7185", icon: "♡" },
  horror:      { gradient: "135deg, #0f0c29 0%, #302b63 50%, #24243e 100%", accent: "#a855f7", icon: "☽" },
  thriller:    { gradient: "135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%", accent: "#38bdf8", icon: "◈" },
  mystery:     { gradient: "135deg, #2c3e50 0%, #3498db 50%, #2980b9 100%", accent: "#60a5fa", icon: "◎" },
  adventure:   { gradient: "135deg, #f7971e 0%, #ffd200 50%, #21d4fd 100%", accent: "#fbbf24", icon: "⊕" },
  scifi:       { gradient: "135deg, #0f2027 0%, #203a43 50%, #2c5364 100%", accent: "#22d3ee", icon: "◇" },
  "sci-fi":    { gradient: "135deg, #0f2027 0%, #203a43 50%, #2c5364 100%", accent: "#22d3ee", icon: "◇" },
  comedy:      { gradient: "135deg, #fddb92 0%, #d1fdff 50%, #f5af19 100%", accent: "#f59e0b", icon: "◉" },
  drama:       { gradient: "135deg, #8e2de2 0%, #4a00e0 50%, #3b82f6 100%", accent: "#a78bfa", icon: "✧" },
  historical: { gradient: "135deg, #b79891 0%, #94716b 50%, #6b4226 100%", accent: "#d4a574", icon: "⬡" },
  default:     { gradient: "135deg, #667eea 0%, #764ba2 50%, #4facfe 100%", accent: "#a78bfa", icon: "✦" },
};

function getGenreTheme(tag?: string) {
  const key = (tag || "default").toLowerCase().trim();
  return GENRE_THEMES[key] ?? GENRE_THEMES.default;
}

function getInitials(title?: string): string {
  if (!title || !title.trim()) return "?";
  const words = title.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
}

interface StoryCoverImageProps {
  title?: string;
  tag?: string;
  size?: "full" | "thumb";
  className?: string;
  style?: React.CSSProperties;
}

const StoryCoverImage: React.FC<StoryCoverImageProps> = ({
  title = "",
  tag = "default",
  size = "full",
  className = "",
  style = {},
}) => {
  const theme = getGenreTheme(tag);
  const initials = getInitials(title);

  if (size === "thumb") {
    return (
      <div
        className={className}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          background: `linear-gradient(${theme.gradient})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.1rem",
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "0.05em",
          textShadow: "0 1px 4px rgba(0,0,0,0.4)",
          userSelect: "none",
          ...style,
        }}
      >
        {initials}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "192px",
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(${theme.gradient})`,
        borderRadius: "inherit",
        ...style,
      }}
    >
      <div style={{
        position: "absolute", top: "-30%", right: "-15%",
        width: "60%", height: "120%",
        background: "rgba(255,255,255,0.08)",
        borderRadius: "50%",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-20%", left: "-10%",
        width: "45%", height: "80%",
        background: "rgba(0,0,0,0.12)",
        borderRadius: "50%",
        pointerEvents: "none",
      }} />

      <div style={{
        position: "absolute", top: "12px", right: "16px",
        fontSize: "3.5rem",
        color: theme.accent,
        opacity: 0.35,
        lineHeight: 1,
        userSelect: "none",
        pointerEvents: "none",
        fontWeight: 300,
      }}>
        {theme.icon}
      </div>

      <div style={{
        position: "absolute", top: "14px", left: "14px",
        background: "rgba(0,0,0,0.28)",
        backdropFilter: "blur(6px)",
        color: "#fff",
        fontSize: "0.65rem",
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        padding: "3px 10px",
        borderRadius: "999px",
        border: `1px solid ${theme.accent}55`,
        userSelect: "none",
      }}>
        {tag}
      </div>

      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          fontSize: "5rem",
          fontWeight: 900,
          color: "rgba(255,255,255,0.12)",
          letterSpacing: "-0.04em",
          lineHeight: 1,
          userSelect: "none",
          pointerEvents: "none",
         }}>
          {initials}
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)",
        padding: "32px 14px 12px",
      }}>
        <p style={{
          margin: 0,
          color: "#fff",
          fontSize: "0.9rem",
          fontWeight: 700,
          lineHeight: 1.3,
          textShadow: "0 1px 6px rgba(0,0,0,0.5)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {title}
        </p>
      </div>
    </div>
  );
};

// ─── Component Type Definitions ─────────────────────────────────────────────

export interface IStories {
  uuid: string;
  title: string;
  content: string;
  tag: string;
  imageURL: string;
  language?: string;
  emotions?: string[];
  genre?: string;
  enhancedPrompt?: string;
}

interface IPost extends IStories {
  topic: ITopicData[];
  isPublished?: boolean;
}

interface StoriesComponentProps {
  stories: IStories[];
  isLogin: boolean;
  setStories: (stories: IStories[]) => void;
  onPublishSuccess?: () => void;
  isLoading?: boolean;
}

type StorySentenceSegment = {
  id: string;
  text: string;
  startWordIndex: number;
  endWordIndex: number;
};

const buildSentenceSegments = (content: string): StorySentenceSegment[] => {
  if (!content.trim()) return [];
  const sentenceMatches = content.match(/[^.!?]+[.!?]*\s*/g) ?? [content];
  const segments: StorySentenceSegment[] = [];
  let wordCursor = 0;
  sentenceMatches.forEach((sentence, index) => {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) return;
    const wordsInSentence = sentence.match(/\S+/g)?.length ?? 0;
    const startWordIndex = wordCursor;
    const endWordIndex = wordsInSentence > 0 ? wordCursor + wordsInSentence - 1 : wordCursor;
    segments.push({ id: `${index}-${startWordIndex}-${endWordIndex}`, text: sentence, startWordIndex, endWordIndex });
    wordCursor += wordsInSentence;
  });
  return segments;
};

// ─── Main View Component ────────────────────────────────────────────────────

export const StoriesViewComponent: React.FC<StoriesComponentProps> = ({
  stories,
  isLogin,
  setStories,
  isLoading,
  onPublishSuccess,
}) => {
  const location = useLocation();
  const audioPlayerRef = useRef<AudioPlayerHandle>(null);
  const dispatch = useDispatch();

  const { error, setError, clearError } = useApiError();

  const [selectedStory, setSelectedStory] = useState<IStories | null>(null);
  const [topics, setTopics] = useState<ITopicData[]>(topicsData);
  const [selectTopics, setSelectTopics] = useState<ITopicData[]>([]);
  const [newTopicTitle, setNewTopicTitle] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [showWorldMap, setShowWorldMap] = useState<boolean>(false);
  const [showRemix, setShowRemix] = useState<boolean>(false);
  const [showTranslator, setShowTranslator] = useState<boolean>(false);
  
  const [createPost] = useCreatePostMutation();
  const [deletePost] = useDeletePostMutation();
  const { data: profile } = useGetProfileInfoQuery(undefined, { skip: !isLogin });
  
  const lastSavedContentRef = useRef<string>("");
  const isSavingRef = useRef<boolean>(false);
  const hasSavedSessionRef = useRef<boolean>(false);
  const savedPostIdRef = useRef<string | null>(null);
  
  const [endingsCache, setEndingsCache] = useState<{
    [uuid: string]: { style: string; ending: string; fullStory: string }[];
  }>({});
  const [originalStoryContent, setOriginalStoryContent] = useState<{ [uuid: string]: string }>({});
  const [isGeneratingEndings, setIsGeneratingEndings] = useState<boolean>(false);
  const [activeEndingTab, setActiveEndingTab] = useState<string>("Happy Ending");
  const [narrationWordIndex, setNarrationWordIndex] = useState<number>(0);
  const [narrationState, setNarrationState] = useState<NarrationPlaybackState>("idle");

  const [generateAlternateEndings] = useGenerateAlternateEndingsMutation();
  const [generateFreeAlternateEndings] = useGenerateFreeAlternateEndingsMutation();

  useEffect(() => {
    if (selectedStory && !originalStoryContent[selectedStory.uuid]) {
      setOriginalStoryContent((prev) => ({ ...prev, [selectedStory.uuid]: selectedStory.content }));
    }
  }, [selectedStory, originalStoryContent]);

  const handleGenerateAlternateEndings = async () => {
    if (!selectedStory) return;
    clearError();
    setIsGeneratingEndings(true);
    const toastId = toast.loading("Generating alternate endings...");
    
    try {
      const payload = {
        title: selectedStory.title,
        content: originalStoryContent[selectedStory.uuid] || selectedStory.content,
        tag: selectedStory.tag,
        language: selectedStory.language || "English",
      };
      
      const generationRequest = isLogin
        ? generateAlternateEndings(payload)
        : generateFreeAlternateEndings(payload);
        
      const res = await generationRequest.unwrap();
      
      if (!res || !Array.isArray(res.data)) {
        throw new Error("Unexpected response format from the AI service.");
      }
      
      setEndingsCache((prev) => ({ ...prev, [selectedStory.uuid]: res.data }));
      toast.success("Alternate endings generated successfully!");
    } catch (err: any) {
      console.error("[StoriesView Alternate Ending Flow Failure]:", err);
      const errorStatus = err?.status || err?.data?.status;
      if (errorStatus) {
        setError(getErrorMessage(new ApiError(errorStatus, err?.data?.message || "")));
      } else {
        setError(getErrorMessage(err));
      }
      toast.error("Failed to generate alternate endings.");
    } finally {
      toast.dismiss(toastId);
      setIsGeneratingEndings(false);
    }
  };

  const handleApplyEnding = (endingData: { style: string; ending: string; fullStory: string }) => {
    if (!selectedStory) return;
    const updatedStory = { ...selectedStory, content: endingData.fullStory };
    setSelectedStory(updatedStory);
    setStories(stories.map((s) => (s.uuid === selectedStory.uuid ? updatedStory : s)));
    toast.success(`${endingData.style} applied to story!`);
  };

  const handleResetEnding = () => {
    if (!selectedStory) return;
    const originalContent = originalStoryContent[selectedStory.uuid];
    if (!originalContent) return;
    const updatedStory = { ...selectedStory, content: originalContent };
    setSelectedStory(updatedStory);
    setStories(stories.map((s) => (s.uuid === selectedStory.uuid ? updatedStory : s)));
    toast.success("Reverted to original story ending!");
  };

  useEffect(() => {
    setSelectTopics(topics.filter((topic) => topic.selected));
  }, [topics]);

  useEffect(() => {
    const player = audioPlayerRef.current;
    return () => { player?.stop(); };
  }, [location.pathname]);

  useEffect(() => { setNarrationWordIndex(0); setNarrationState("idle"); }, [selectedStory?.uuid]);

  const sentenceSegments = useMemo(() => buildSentenceSegments(selectedStory?.content ?? ""), [selectedStory?.content]);

  useEffect(() => {
    if (stories && stories.length > 0) {
      setSelectedStory(stories[0]);
      dispatch(setStory({
        id: stories[0].uuid,
        title: stories[0].title,
        chapters: [{ id: 1, title: "Chapter 1", content: stories[0].content, createdAt: new Date().toISOString() }],
      }));
    } else {
      setSelectedStory(null);
    }
    lastSavedContentRef.current = "";
    hasSavedSessionRef.current = false;
    savedPostIdRef.current = null;
  }, [stories, dispatch]);

  useEffect(() => {
    const autoSaveStory = async () => {
      if (!isLogin || !selectedStory) return;
      if (selectedStory.content === lastSavedContentRef.current) return;
      if (hasSavedSessionRef.current) return;
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      const post: IPost = { ...selectedStory, topic: selectTopics, isPublished: false };
      try {
        const result = await createPost(post).unwrap();
        if (result && result.data && result.data._id) savedPostIdRef.current = result.data._id;
        lastSavedContentRef.current = selectedStory.content;
        hasSavedSessionRef.current = true;
        toast.success("Story auto-saved!");
      } catch (error) {
        console.error("Auto-save failed", error);
      } finally {
        isSavingRef.current = false;
      }
    };
    const timer = setTimeout(() => { autoSaveStory(); }, 1000);
    return () => clearTimeout(timer);
  }, [selectedStory, selectedStory?.content, isLogin, selectTopics, createPost]);

  const handelStorySelection = (story: IStories) => { setSelectedStory(story); };

  const handleTopicClick = (index: number) => {
    setTopics((currentTopics) =>
      currentTopics.map((topic, topicIndex) =>
        topicIndex === index ? { ...topic, selected: !topic.selected } : topic
      )
    );
  };

  const handleAddTopic = () => {
    const title = newTopicTitle.trim();
    if (!title) { toast.error("Please enter a topic."); return; }
    const normalizedTitle = title.startsWith("#") ? title : `#${title}`;
    const topicExists = topics.some((topic) => topic.title.toLowerCase() === normalizedTitle.toLowerCase());
    if (topicExists) { toast.error("This topic already exists."); return; }
    setTopics((currentTopics) => [...currentTopics, { title: normalizedTitle, className: SELECTED_TOPIC_CLASSES, color: SELECTED_TOPIC_CLASSES, selected: true }]);
    setNewTopicTitle("");
  };

  const handleRemoveTopic = (index: number) => {
    if (topics.length <= 2) { toast.error("At least 2 topics are required."); return; }
    setTopics((currentTopics) => currentTopics.filter((_, topicIndex) => topicIndex !== index));
  };

  const handleCopyStory = async () => {
    if (selectedStory?.content) {
      await navigator.clipboard.writeText(selectedStory.content);
      setIsCopied(true);
      toast.success("Story copied!");
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleExportPDF = async () => {
    if (!selectedStory) { toast.error("No story available to export."); return; }
    const toastId = toast.loading("Preparing your premium PDF...");
    try {
      const loadImageWithTimeout = (src: string, timeoutMs: number = 3000): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          const timeout = setTimeout(() => { img.src = ""; reject(new Error(`Timeout loading image: ${src}`)); }, timeoutMs);
          img.onload = () => { clearTimeout(timeout); resolve(img); };
          img.onerror = (e) => { clearTimeout(timeout); reject(e); };
          img.src = src;
        });
      };

      let logoImg: HTMLImageElement | null = null;
      try { logoImg = await loadImageWithTimeout(logo); } catch (err) { console.warn("Failed to load logo", err); }

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const title = selectedStory.title || "Untitled Story";
      const content = selectedStory.content || "";
      const tag = (selectedStory.tag || "STORY").toUpperCase();
      const leftMargin = 20, rightMargin = 20, topMargin = 20, bottomMargin = 20;
      const printableWidth = 210 - leftMargin - rightMargin;
      const maxY = 297 - bottomMargin - 10;
      let yCursor = topMargin;

      if (logoImg) {
        const logoHeight = 8;
        const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
        doc.addImage(logoImg, "PNG", leftMargin, yCursor, logoWidth, logoHeight);
      } else {
        doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(99, 102, 241);
        doc.text("StorySparkAI", leftMargin, yCursor + 6);
      }
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
      doc.text("PREMIUM AI GENERATED STORY", 190, yCursor + 5, { align: "right" });
      yCursor += 10;
      doc.setDrawColor(99, 102, 241); doc.setLineWidth(0.5); doc.line(leftMargin, yCursor, 190, yCursor);
      yCursor += 8;

      doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(30, 41, 59);
      const splitTitle = doc.splitTextToSize(title, printableWidth);
      splitTitle.forEach((line: string) => { doc.text(line, leftMargin, yCursor); yCursor += 9; });
      yCursor += 1;

      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100, 116, 139);
      const formattedDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      doc.text(`Generated on ${formattedDate}`, leftMargin, yCursor);
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      const tagWidth = doc.getTextWidth(tag);
      const chipWidth = tagWidth + 5, chipHeight = 5, chipX = 190 - chipWidth, chipY = yCursor - 3.8;
      doc.setFillColor(99, 102, 241); doc.roundedRect(chipX, chipY, chipWidth, chipHeight, 1, 1, "F");
      doc.setTextColor(255, 255, 255); doc.text(tag, chipX + 2.5, chipY + 3.5);
      yCursor += 4.5;
      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2); doc.line(leftMargin, yCursor, 190, yCursor);
      yCursor += 10;

      const paragraphs = content.split(/\n+/);
      doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(30, 41, 59);
      paragraphs.forEach((para: string, pIdx: number) => {
        const cleanPara = para.trim();
        if (!cleanPara) return;
        const lines = doc.splitTextToSize(cleanPara, printableWidth);
        lines.forEach((line: string) => {
          if (yCursor > maxY) { doc.addPage(); yCursor = 30; }
          doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(30, 41, 59);
          doc.text(line, leftMargin, yCursor); yCursor += 6.5;
        });
        if (pIdx < paragraphs.length - 1) yCursor += 4.5;
      });

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(241, 245, 249); doc.setLineWidth(0.25); doc.line(leftMargin, 280, 190, 280);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
        doc.text("Generated with StorySparkAI", leftMargin, 285);
        doc.text(`Page ${i} of ${totalPages}`, 190, 285, { align: "right" });
        if (i > 1) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(99, 102, 241);
          doc.text("StorySparkAI", leftMargin, 14);
          doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
          const headerTitle = title.length > 50 ? title.substring(0, 50) + "..." : title;
          doc.text(headerTitle, 190, 14, { align: "right" });
          doc.setDrawColor(241, 245, 249); doc.setLineWidth(0.2); doc.line(leftMargin, 17, 190, 17);
        }
      }

      const safeTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      doc.save(`${safeTitle}.pdf`);
      toast.dismiss(toastId);
      toast.success("Premium PDF downloaded!");
    } catch (error) {
      console.error(error); toast.dismiss(toastId); toast.error("Failed to export PDF.");
    }
  };

  const handleExportMarkdown = () => {
    if (!selectedStory) { toast.error("No story available to export."); return; }
    try {
      const title = selectedStory.title || "Story";
      const content = selectedStory.content || "";
      const tag = selectedStory.tag || "General";
      const authorName = isLogin && profile?.name ? profile.name : "Anonymous";
      const isoDate = new Date().toISOString().split("T")[0];
      const markdownContent = `---\ntitle: "${title.replace(/"/g, '\\"')}"\ntag: "${tag.replace(/"/g, '\\"')}"\nauthor: "${authorName.replace(/"/g, '\\"')}"\ndate: "${isoDate}"\n---\n\n# ${title}\n\n${content}\n`;
      const blob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "story"}.md`);
      document.body.appendChild(link); link.click();
      document.body.removeChild(link); URL.revokeObjectURL(url);
      toast.success("Markdown downloaded!");
    } catch (error) { console.error(error); toast.error("Failed to export Markdown."); }
  };

  const handelPublishStory = async () => {
    if (!isLogin) { toast.error("Please login to publish the story."); return; }
    if (!selectedStory) { toast.error("No story available. Please generate a story first."); return; }
    if (selectTopics.length < 2) { toast.error("Please select at least 2 topics."); return; }
    const post: IPost = { ...selectedStory, topic: selectTopics, isPublished: true };
    setLoading(true);
    try {
      if (savedPostIdRef.current) {
        try { await deletePost(savedPostIdRef.current).unwrap(); }
        catch (deleteError) { console.warn("Failed to delete draft:", deleteError); }
      }
      const result = await createPost(post).unwrap();
      if (result) { toast.success("Story published successfully!"); setStories([]); setSelectedStory(null); onPublishSuccess?.(); }
    } catch { toast.error("Something went wrong. Please try again."); }
    finally { setLoading(false); }
  };

  const calculateReadingTime = (content: string): number => Math.max(1, Math.ceil(getWordCount(content) / 200));
  const isNarrationActive = narrationState !== "idle";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <StoryGeneratingAnimation />
      </div>
    );
  }
  
  if (!stories.length) {
    return (
      <div className="text-center text-gray-400 py-10">
        No stories generated yet. Start by entering a prompt ✨
      </div>
    );
  }

  if (!selectedStory) return null;

  return (
    <div className="mt-16 px-4 sm:px-6 lg:px-8 max-w-8xl mx-auto pb-10">
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.6s ease-out forwards; }
      `}</style>

      {/* Accessible Error Notification Banner */}
      {error && (
        <div className="mb-6 max-w-4xl mx-auto animate-fade-in-up">
          <ErrorToast
            message={error}
            onClose={clearError}
            autoCloseDuration={6000}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in-up">
        {/* Left main grid context column */}
        <div className="col-span-1 lg:col-span-8 flex flex-col">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-blue-400 mb-2">
                {selectedStory?.title}
              </h1>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-purple-900/60 text-purple-300 border border-purple-700/50 py-1 px-3 text-xs font-semibold">
                  🎭 {selectedStory.tag}
                </span>
                <span className="inline-flex items-center rounded-full bg-blue-900/60 text-blue-300 border border-blue-700/50 py-1 px-3 text-xs font-semibold">
                  🌐 {selectedStory.language || "English"}
                </span>
                {selectedStory.emotions && selectedStory.emotions.length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 py-1 px-3 text-xs font-semibold">
                    😊 {selectedStory.emotions.join(", ")}
                  </span>
                )}
              </div>
            </div>

            {/* Story choosing thumbnails selection tray */}
            <div className="flex justify-start sm:justify-end">
              <div className="flex -space-x-5">
                {stories && stories.length > 0 && stories.map((story) => (
                  <button
                    key={story.uuid}
                    className={`relative w-16 h-16 rounded-full border-2 ${
                      selectedStory?.uuid === story.uuid ? "border-blue-500 scale-110" : "border-white"
                    } hover:scale-110 transition-transform duration-200 focus:outline-none overflow-hidden`}
                    onClick={() => handelStorySelection(story)}
                    title={story.title}
                  >
                    <StoryCoverImage
                      title={story.title}
                      tag={story.tag}
                      size="thumb"
                      style={{ width: "100%", height: "100%" }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main layout container panel layout wrapper */}
          <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 p-8 rounded-2xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-[-50px] left-[-50px] w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h3 className="text-xl font-bold text-slate-200 relative z-10">Generated Story</h3>
              <div className="flex flex-wrap items-center gap-2 relative z-10">
                <button type="button" className="rounded-lg px-4 py-2 bg-slate-700 text-slate-200 font-semibold cursor-pointer hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" onClick={handleCopyStory} disabled={!selectedStory}>
                  {isCopied ? "✓ Copied" : "📋 Copy"}
                </button>
                <button type="button" className="rounded-lg px-4 py-2 bg-purple-700 text-slate-200 font-semibold cursor-pointer hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" onClick={handleExportPDF} disabled={!selectedStory}>
                  📄 Export PDF
                </button>
                <button type="button" className="rounded-lg px-4 py-2 bg-indigo-700 text-slate-200 font-semibold cursor-pointer hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" onClick={handleExportMarkdown} disabled={!selectedStory}>
                  ⬇️ Export Markdown
                </button>
                <button type="button" className="rounded-lg px-4 py-2 bg-violet-700 text-slate-200 font-semibold cursor-pointer hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => setShowWorldMap(true)} disabled={!selectedStory}>
                  🗺️ World Map
                </button>
                <button type="button" className="rounded-lg px-4 py-2 bg-fuchsia-700 text-slate-200 font-semibold cursor-pointer hover:bg-fuchsia-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => setShowRemix(true)} disabled={!selectedStory}>
                  🔀 Remix
                </button>
                <button type="button" className="rounded-lg px-4 py-2 bg-emerald-700 text-slate-200 font-semibold cursor-pointer hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => setShowTranslator(true)} disabled={!selectedStory}>
                  🌍 Translate
                </button>
                <button
                  type="button"
                  id="publish-story-btn"
                  className={`rounded-lg px-5 py-2 font-semibold flex items-center space-x-2 cursor-pointer bg-blue-600 text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${loading ? "" : "hover:bg-blue-500 hover:shadow-lg active:scale-95"}`}
                  onClick={handelPublishStory}
                  disabled={loading || !selectedStory}
                >
                  {loading ? "Publishing..." : "Publish"}
                </button>
              </div>
            </div>

            {selectedStory.enhancedPrompt && (
              <div className="mb-6 p-4 bg-indigo-900/30 border border-indigo-700/50 rounded-xl relative z-10">
                <h4 className="text-sm font-semibold text-indigo-300 mb-2 flex items-center gap-2">
                  <i className="fas fa-wand-magic-sparkles"></i> AI Enhanced Prompt
                </h4>
                <p className="text-slate-300 text-sm italic break-words whitespace-pre-wrap">{selectedStory.enhancedPrompt}</p>
              </div>
            )}

            <div id="story-content" className="prose prose-invert max-w-none text-slate-300 leading-relaxed tracking-wide relative z-10">
              <p className="break-words whitespace-pre-wrap">
                {sentenceSegments.length > 0 ? (
                  sentenceSegments.map((segment: StorySentenceSegment) => {
                    const isActiveSentence = isNarrationActive && narrationWordIndex >= segment.startWordIndex && narrationWordIndex <= segment.endWordIndex;
                    return (
                      <span key={segment.id} className={isActiveSentence ? "rounded-md bg-indigo-500/20 px-0.5 py-0.5 text-indigo-100 ring-1 ring-indigo-400/30" : undefined}>
                        {segment.text}
                      </span>
                    );
                  })
                ) : selectedStory.content}
              </p>
            </div>

            <div className="relative z-10 mt-6">
              <AudioPlayer ref={audioPlayerRef} text={selectedStory.content} title={selectedStory.title} onWordIndexChange={setNarrationWordIndex} onPlaybackStateChange={setNarrationState} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 relative z-10">
              <ContinueStoryButton />
              <button
                type="button"
                className="w-full rounded-xl py-3.5 px-5 font-bold transition-all duration-200 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-orange-950/20 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
                onClick={handleGenerateAlternateEndings}
                disabled={isGeneratingEndings}
              >
                {isGeneratingEndings ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating New Endings...
                  </>
                ) : (
                  <>✨ Generate Alternate Endings</>
                )}
              </button>
            </div>
          </div>

          {/* Alternative Endings Tab Selection Overlay Panels */}
          {endingsCache[selectedStory.uuid] && endingsCache[selectedStory.uuid].length > 0 && (
            <div className="mt-8 bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl animate-fade-in-up">
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-4 mb-4">
                <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                  🔮 Choose Alternate Paths
                </h3>
                <button
                  type="button"
                  className="text-xs font-semibold text-rose-400 hover:text-rose-300 underline underline-offset-4 bg-none border-none cursor-pointer"
                  onClick={handleResetEnding}
                >
                  Reset to Original Story
                </button>
              </div>

              <div className="flex border-b border-slate-700/40 gap-2 mb-4 overflow-x-auto pb-1">
                {endingsCache[selectedStory.uuid].map((item) => (
                  <button
                    key={item.style}
                    type="button"
                    className={`px-4 py-2 text-sm font-medium rounded-t-xl border-b-2 transition-all whitespace-nowrap ${
                      activeEndingTab === item.style
                        ? "text-blue-400 border-blue-500 bg-blue-500/10"
                        : "text-slate-400 border-transparent hover:text-slate-300"
                    }`}
                    onClick={() => setActiveEndingTab(item.style)}
                  >
                    {item.style}
                  </button>
                ))}
              </div>

              {endingsCache[selectedStory.uuid].map((item) => {
                if (activeEndingTab !== item.style) return null;
                return (
                  <div key={item.style} className="space-y-4">
                    <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-700/30">
                      <h4 className="text-sm font-semibold text-amber-400 mb-1">Ending Highlight:</h4>
                      <p className="text-slate-300 text-sm italic whitespace-pre-wrap">{item.ending}</p>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg px-4 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                      onClick={() => handleApplyEnding(item)}
                    >
                      Apply This Path to Story
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Topics selection metadata footer panels layout wrapper */}
          <div className="mt-7">
            <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-200 mb-4">Select Story Topics</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {topics.map((topic, index) => (
                  <button
                    key={topic.title}
                    type="button"
                    onClick={() => handleTopicClick(index)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-150 ${
                      topic.selected
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/40"
                        : "bg-slate-700/50 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {topic.title}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add custom topic (e.g. sci-fi)"
                  value={newTopicTitle}
                  onChange={(e) => setNewTopicTitle(e.target.value)}
                  className="flex-1 px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddTopic}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right metadata panel display board */}
        <div className="col-span-1 lg:col-span-4 space-y-6">
          <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl text-center">
            <div className="w-20 h-20 mx-auto bg-indigo-600/10 rounded-full flex items-center justify-center text-indigo-400 text-2xl mb-3">
              ⏱️
            </div>
            <h4 className="text-slate-400 text-xs font-semibold tracking-wider uppercase mb-1">Reading Overhead</h4>
            <p className="text-2xl font-bold text-slate-200">
              {calculateReadingTime(selectedStory.content)} {calculateReadingTime(selectedStory.content) === 1 ? "min" : "mins"}
            </p>
            <p className="text-xs text-slate-400 mt-1">{getWordCount(selectedStory.content)} words total</p>
          </div>
        </div>
      </div>

      {/* Modals Mounting Portal Blocks */}
      {showWorldMap && <StoryWorldMap story={selectedStory} onClose={() => setShowWorldMap(false)} />}
      {showRemix && <StoryRemix story={selectedStory} onClose={() => setShowRemix(false)} />}
      {showTranslator && <StoryTranslator story={selectedStory} onClose={() => setShowTranslator(false)} />}
      
      <Toaster position="bottom-right" reverseOrder={false} />
    </div>
  );
};
export default StoriesViewComponent;