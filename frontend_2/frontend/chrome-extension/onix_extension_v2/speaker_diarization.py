#!/usr/bin/env python3
"""
Advanced speaker diarization using pyannote-audio
This script provides more sophisticated speaker identification
"""

import os
import sys
import json
import tempfile
import base64
from pathlib import Path
import numpy as np
import torch
import torchaudio
from pyannote.audio import Pipeline
from pyannote.core import Segment
import whisper
from typing import Dict, List, Tuple, Optional

class SpeakerDiarization:
    def __init__(self, model_name: str = "base"):
        """
        Initialize the speaker diarization system
        
        Args:
            model_name: Whisper model name (tiny, base, small, medium, large)
        """
        self.whisper_model = whisper.load_model(model_name)
        
        # Load pyannote pipeline for speaker diarization
        # Note: You need to accept the terms on Hugging Face for pyannote/speaker-diarization
        try:
            self.diarization_pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization",
                use_auth_token="YOUR_HUGGINGFACE_TOKEN"  # Replace with your token
            )
        except Exception as e:
            print(f"Warning: Could not load pyannote pipeline: {e}")
            self.diarization_pipeline = None
        
        # Speaker profiles for voice recognition
        self.speaker_profiles = {}
        
        # Persistent speaker ID mapping
        self.voice_to_speaker_map = {}
        self.next_speaker_id = 1
        
    def process_audio_chunk(self, audio_data: bytes, sample_rate: int = 16000) -> Dict:
        """
        Process audio chunk for transcription and speaker identification
        
        Args:
            audio_data: Raw audio data
            sample_rate: Audio sample rate
            
        Returns:
            Dictionary with transcription and speaker information
        """
        try:
            # Convert bytes to numpy array
            audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
            
            # Transcribe using Whisper
            result = self.whisper_model.transcribe(
                audio_array,
                language="en",
                word_timestamps=True
            )
            
            text = result["text"].strip()
            if not text:
                return {"text": "", "speaker": "Speaker 1", "confidence": 0.0}
            
            # Simple speaker identification (fallback)
            speaker = self.identify_speaker_simple(audio_array, sample_rate)
            
            return {
                "text": text,
                "speaker": speaker,
                "confidence": 0.85,  # Placeholder confidence
                "word_timestamps": result.get("segments", [])
            }
            
        except Exception as e:
            print(f"Error processing audio chunk: {e}")
            return {"text": "", "speaker": "Speaker 1", "confidence": 0.0, "error": str(e)}
    
    def identify_speaker_simple(self, audio_array: np.ndarray, sample_rate: int) -> str:
        """
        Simple speaker identification based on audio characteristics
        
        Args:
            audio_array: Audio data as numpy array
            sample_rate: Sample rate of the audio
            
        Returns:
            Speaker name
        """
        # Calculate basic audio features for voice signature
        rms_energy = np.sqrt(np.mean(audio_array**2))
        zero_crossing_rate = np.mean(np.diff(np.sign(audio_array)) != 0)
        spectral_centroid = np.sum(np.abs(np.fft.fft(audio_array)) * np.arange(len(audio_array))) / np.sum(np.abs(np.fft.fft(audio_array)))
        
        # Create a voice signature based on audio characteristics
        voice_signature = hash((rms_energy, zero_crossing_rate, spectral_centroid))
        
        # Check if we've seen this voice before
        if voice_signature in self.voice_to_speaker_map:
            return self.voice_to_speaker_map[voice_signature]
        
        # New voice - assign next available speaker ID
        speaker_id = f"Speaker {self.next_speaker_id}"
        self.voice_to_speaker_map[voice_signature] = speaker_id
        self.next_speaker_id += 1
        
        print(f"New voice detected, assigned: {speaker_id}")
        return speaker_id
    
    def register_speaker(self, speaker_name: str, audio_data: bytes, sample_rate: int = 16000) -> bool:
        """
        Register a new speaker profile
        
        Args:
            speaker_name: Name of the speaker
            audio_data: Audio sample for the speaker
            sample_rate: Sample rate of the audio
            
        Returns:
            True if registration successful, False otherwise
        """
        try:
            audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
            
            # Extract features for speaker profile
            features = self.extract_speaker_features(audio_array, sample_rate)
            
            self.speaker_profiles[speaker_name] = {
                "features": features,
                "audio_length": len(audio_array),
                "sample_rate": sample_rate
            }
            
            return True
            
        except Exception as e:
            print(f"Error registering speaker {speaker_name}: {e}")
            return False
    
    def extract_speaker_features(self, audio_array: np.ndarray, sample_rate: int) -> Dict:
        """
        Extract speaker-specific features from audio
        
        Args:
            audio_array: Audio data as numpy array
            sample_rate: Sample rate of the audio
            
        Returns:
            Dictionary of extracted features
        """
        # Basic audio features
        rms_energy = np.sqrt(np.mean(audio_array**2))
        zero_crossing_rate = np.mean(np.diff(np.sign(audio_array)) != 0)
        
        # Spectral features
        fft = np.fft.fft(audio_array)
        magnitude_spectrum = np.abs(fft)
        spectral_centroid = np.sum(magnitude_spectrum * np.arange(len(magnitude_spectrum))) / np.sum(magnitude_spectrum)
        
        # MFCC-like features (simplified)
        mfcc_features = self.compute_mfcc(audio_array, sample_rate)
        
        return {
            "rms_energy": float(rms_energy),
            "zero_crossing_rate": float(zero_crossing_rate),
            "spectral_centroid": float(spectral_centroid),
            "mfcc": mfcc_features.tolist()
        }
    
    def compute_mfcc(self, audio_array: np.ndarray, sample_rate: int, n_mfcc: int = 13) -> np.ndarray:
        """
        Compute simplified MFCC features
        
        Args:
            audio_array: Audio data as numpy array
            sample_rate: Sample rate of the audio
            n_mfcc: Number of MFCC coefficients
            
        Returns:
            MFCC features as numpy array
        """
        # Simplified MFCC computation
        # In a real implementation, you would use librosa or similar
        
        # Apply windowing
        windowed = audio_array * np.hanning(len(audio_array))
        
        # FFT
        fft = np.fft.fft(windowed)
        magnitude_spectrum = np.abs(fft)
        
        # Mel-scale filter bank (simplified)
        mel_filters = self.create_mel_filter_bank(sample_rate, len(magnitude_spectrum), n_mfcc)
        mel_spectrum = np.dot(mel_filters, magnitude_spectrum)
        
        # Log and DCT
        log_mel = np.log(mel_spectrum + 1e-10)
        mfcc = np.fft.dct(log_mel, norm='ortho')[:n_mfcc]
        
        return mfcc
    
    def create_mel_filter_bank(self, sample_rate: int, n_fft: int, n_mels: int) -> np.ndarray:
        """
        Create mel-scale filter bank
        
        Args:
            sample_rate: Sample rate of the audio
            n_fft: FFT size
            n_mels: Number of mel filters
            
        Returns:
            Mel filter bank as numpy array
        """
        # Simplified mel filter bank
        # In a real implementation, you would use librosa.filters.mel
        
        low_freq = 0
        high_freq = sample_rate // 2
        
        # Convert to mel scale
        low_mel = self.hz_to_mel(low_freq)
        high_mel = self.hz_to_mel(high_freq)
        
        # Create mel points
        mel_points = np.linspace(low_mel, high_mel, n_mels + 2)
        hz_points = self.mel_to_hz(mel_points)
        
        # Create filter bank
        filter_bank = np.zeros((n_mels, n_fft // 2 + 1))
        
        for i in range(1, n_mels + 1):
            left = int(hz_points[i - 1] * n_fft / sample_rate)
            center = int(hz_points[i] * n_fft / sample_rate)
            right = int(hz_points[i + 1] * n_fft / sample_rate)
            
            # Rising edge
            for j in range(left, center):
                filter_bank[i - 1, j] = (j - left) / (center - left)
            
            # Falling edge
            for j in range(center, right):
                filter_bank[i - 1, j] = (right - j) / (right - center)
        
        return filter_bank
    
    def hz_to_mel(self, hz: float) -> float:
        """Convert Hz to mel scale"""
        return 2595 * np.log10(1 + hz / 700)
    
    def mel_to_hz(self, mel: float) -> float:
        """Convert mel scale to Hz"""
        return 700 * (10**(mel / 2595) - 1)
    
    def identify_speaker_advanced(self, audio_array: np.ndarray, sample_rate: int) -> str:
        """
        Advanced speaker identification using registered profiles
        
        Args:
            audio_array: Audio data as numpy array
            sample_rate: Sample rate of the audio
            
        Returns:
            Speaker name
        """
        if not self.speaker_profiles:
            return self.identify_speaker_simple(audio_array, sample_rate)
        
        # Extract features from current audio
        current_features = self.extract_speaker_features(audio_array, sample_rate)
        
        # Compare with registered profiles
        best_match = None
        best_score = float('inf')
        
        for speaker_name, profile in self.speaker_profiles.items():
            # Calculate similarity score (simplified)
            score = self.calculate_similarity(current_features, profile["features"])
            
            if score < best_score:
                best_score = score
                best_match = speaker_name
        
        # Return best match if score is below threshold
        if best_score < 0.5:  # Threshold for speaker identification
            return best_match
        else:
            # No match found, assign new persistent speaker ID
            speaker_id = f"Speaker {self.next_speaker_id}"
            self.next_speaker_id += 1
            print(f"No match found, assigned new speaker: {speaker_id}")
            return speaker_id
    
    def calculate_similarity(self, features1: Dict, features2: Dict) -> float:
        """
        Calculate similarity between two feature sets
        
        Args:
            features1: First feature set
            features2: Second feature set
            
        Returns:
            Similarity score (lower is more similar)
        """
        # Simple Euclidean distance for basic features
        score = 0.0
        
        # RMS energy similarity
        score += abs(features1["rms_energy"] - features2["rms_energy"])
        
        # Zero crossing rate similarity
        score += abs(features1["zero_crossing_rate"] - features2["zero_crossing_rate"])
        
        # Spectral centroid similarity
        score += abs(features1["spectral_centroid"] - features2["spectral_centroid"]) / 1000
        
        # MFCC similarity
        mfcc1 = np.array(features1["mfcc"])
        mfcc2 = np.array(features2["mfcc"])
        score += np.mean(np.abs(mfcc1 - mfcc2))
        
        return score

def main():
    """Main function for testing"""
    diarization = SpeakerDiarization()
    
    # Test with sample audio data
    sample_audio = np.random.randn(16000).astype(np.float32)  # 1 second of random audio
    
    result = diarization.process_audio_chunk(sample_audio.tobytes())
    print(f"Transcription result: {result}")

if __name__ == "__main__":
    main()
