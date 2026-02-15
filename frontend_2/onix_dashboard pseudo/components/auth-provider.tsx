"use client"

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

type AuthContextValue = {
  app: FirebaseApp
  authUser: User | null
  isLoading: boolean
  signInWithGoogle: () => Promise<void>
  signOutUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// TODO: replace with your actual dashboard Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let singletonApp: FirebaseApp | null = null

function getOrInitApp(): FirebaseApp {
  if (singletonApp) return singletonApp
  singletonApp = initializeApp(firebaseConfig)
  // Initialize Firestore to ensure it treeshakes with same app
  getFirestore(singletonApp)
  return singletonApp
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const app = useMemo(() => getOrInitApp(), [])
  const auth = useMemo(() => getAuth(app), [app])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user)
      setIsLoading(false)
    })
    return () => unsub()
  }, [auth])

  const value = useMemo<AuthContextValue>(() => ({
    app,
    authUser,
    isLoading,
    signInWithGoogle: async () => {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    },
    signOutUser: async () => {
      await signOut(auth)
    },
  }), [app, authUser, isLoading, auth])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}


