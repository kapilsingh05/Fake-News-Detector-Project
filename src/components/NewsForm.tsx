import { useState } from 'react';
import {
  FileText,
  Link as LinkIcon,
  Image as ImageIcon,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { motion } from 'framer-motion';
import Tesseract from 'tesseract.js';

const categories = [
  'education',
  'finance',
  'politics',
  'world',
  'india',
  'tech',
  'entertainment',
  'sports',
  'science',
];

interface NewsFormProps {
  onSubmit: (data: {
    source: string;
    category: string;
    type: 'text' | 'link';
  }) => Promise<any>;
  onCachedResult: (cachedResult: any) => void;
}

export default function NewsForm({
  onSubmit,
  onCachedResult,
}: NewsFormProps) {
  const [source, setSource] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<'text' | 'link' | 'image'>('text');

  const [isSubmitting, setIsSubmitting] = useState(false);

  // OCR states
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    setSelectedImage(file);
    setExtractedText('');
    setOcrProgress(0);
    setOcrLoading(true);

    try {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: (message) => {
          if (
            message.status === 'recognizing text' &&
            typeof message.progress === 'number'
          ) {
            setOcrProgress(Math.round(message.progress * 100));
          }
        },
      });

      const text = result.data.text.trim();

      setExtractedText(text);
      setSource(text);
    } catch (error) {
      console.error('OCR Error:', error);
      setExtractedText('');
      setSource('');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Image mode uses the OCR extracted text
    const finalSource = type === 'image' ? extractedText : source;

    if (!finalSource || !category) return;

    setIsSubmitting(true);

    try {
      const res = await onSubmit({
        source: finalSource,
        category,
        type: type === 'link' ? 'link' : 'text',
      });

      if (res) {
        onCachedResult(res);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const changeType = (newType: 'text' | 'link' | 'image') => {
    setType(newType);

    // Clear image/OCR data when leaving image mode
    if (newType !== 'image') {
      setSelectedImage(null);
      setExtractedText('');
      setOcrProgress(0);
      setOcrLoading(false);
    }

    // Clear source when switching between input types
    setSource('');
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Type selector */}
      <div className="flex flex-wrap sm:flex-nowrap gap-3 bg-gray-50 p-1.5 rounded-xl">

        {/* TEXT */}
        <motion.button
          type="button"
          onClick={() => changeType('text')}
          className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
            type === 'text'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-transparent text-gray-700 hover:bg-gray-100'
          }`}
          whileHover={type !== 'text' ? { scale: 1.02 } : {}}
          whileTap={{ scale: 0.98 }}
        >
          <FileText size={18} />
          <span>Text</span>
        </motion.button>

        {/* URL */}
        <motion.button
          type="button"
          onClick={() => changeType('link')}
          className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
            type === 'link'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-transparent text-gray-700 hover:bg-gray-100'
          }`}
          whileHover={type !== 'link' ? { scale: 1.02 } : {}}
          whileTap={{ scale: 0.98 }}
        >
          <LinkIcon size={18} />
          <span>URL</span>
        </motion.button>

        {/* IMAGE */}
        <motion.button
          type="button"
          onClick={() => changeType('image')}
          className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
            type === 'image'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-transparent text-gray-700 hover:bg-gray-100'
          }`}
          whileHover={type !== 'image' ? { scale: 1.02 } : {}}
          whileTap={{ scale: 0.98 }}
        >
          <ImageIcon size={18} />
          <span>Image</span>
        </motion.button>
      </div>

      {/* Input section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-gray-50 p-5 rounded-xl"
      >
        {/* TEXT MODE */}
        {type === 'text' && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              📝 Enter news text
            </label>

            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              placeholder="Paste your news text here..."
              required
            />
          </>
        )}

        {/* URL MODE */}
        {type === 'link' && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              🔗 Enter news URL
            </label>

            <input
              type="url"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              placeholder="https://example.com/news-article"
              required
            />
          </>
        )}

        {/* IMAGE MODE */}
        {type === 'image' && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              🖼️ Upload news screenshot
            </label>

            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="w-full px-4 py-3 border border-gray-300 bg-white rounded-lg cursor-pointer"
              required={!selectedImage}
            />

            {/* OCR progress */}
            {ocrLoading && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Extracting text...</span>
                  <span>{ocrProgress}%</span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-200"
                    style={{ width: `${ocrProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Extracted text */}
            {extractedText && !ocrLoading && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📄 Extracted Text
                </label>

                <textarea
                  value={extractedText}
                  onChange={(e) => {
                    setExtractedText(e.target.value);
                    setSource(e.target.value);
                  }}
                  className="w-full h-40 px-4 py-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="OCR extracted text will appear here..."
                />
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* Category dropdown */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-gray-50 p-5 rounded-xl relative"
      >
        <label className="block text-sm font-medium text-gray-700 mb-3">
          📊 Select a category
        </label>

        <div className="relative">
          <select
            title="Select a category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 bg-white rounded-lg appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow text-gray-700"
            required
          >
            <option value="">Choose the news category</option>

            {categories.map((cat) => (
              <option key={cat} value={cat} className="py-1">
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>

          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
            <ChevronDown size={16} />
          </div>
        </div>
      </motion.div>

      {/* Submit button */}
      <motion.button
        type="submit"
        className="w-full bg-blue-600 text-white py-3 px-6 rounded-xl font-bold shadow-md hover:bg-blue-700 transition-colors flex items-center justify-center"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        disabled={
          isSubmitting ||
          (type === 'image' && (!extractedText || ocrLoading))
        }
      >
        {isSubmitting ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />

              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>

            Processing...
          </>
        ) : (
          'Verify News'
        )}
      </motion.button>

      {/* Info text */}
      <div className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 p-4 rounded-xl">
        <AlertCircle
          size={16}
          className="text-blue-500 flex-shrink-0"
        />

        <p>
          We'll analyze your news using trusted sources and AI
          verification to determine its credibility.
        </p>
      </div>
    </motion.form>
  );
}