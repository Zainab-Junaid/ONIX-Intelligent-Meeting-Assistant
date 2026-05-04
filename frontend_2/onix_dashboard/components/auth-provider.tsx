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
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'

type AuthContextValue = {
  app: FirebaseApp
  authUser: User | null
  isLoading: boolean
  signInWithGoogle: () => Promise<void>
  signOutUser: () => Promise<void>
  requestCalendarAccess: () => Promise<boolean>
  hasCalendarAccess: boolean
  isFirstTimeUser: boolean
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
  const [hasCalendarAccess, setHasCalendarAccess] = useState(false)
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false)

  const app = useMemo(() => getOrInitApp(), [])
  const auth = useMemo(() => getAuth(app), [app])
  const db = useMemo(() => getFirestore(app), [app])

  // Check if user has calendar access
  useEffect(() => {
    if (!authUser) {
      setHasCalendarAccess(false)
      setIsFirstTimeUser(false)
      return
    }

    const checkUserStatus = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', authUser.uid))
        if (userDoc.exists()) {
          const userData = userDoc.data()
          setHasCalendarAccess(!!(userData?.googleCalendar?.accessToken || userData?.calendarAccessToken))
          setIsFirstTimeUser(false)
        } else {
          setIsFirstTimeUser(true)
          setHasCalendarAccess(false)
        }
      } catch (error) {
        console.error('Error checking user status:', error)
        setHasCalendarAccess(false)
        setIsFirstTimeUser(false)
      }
    }

    checkUserStatus()
  }, [authUser, db])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user)
      setIsLoading(false)

      // Check if this is a first-time signup
      if (user) {
        try {
          const db = getFirestore(app)
          const userDoc = await getDoc(doc(db, 'users', user.uid))

          if (!userDoc.exists()) {
            // First-time user - create user document
            await setDoc(doc(db, 'users', user.uid), {
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              createdAt: new Date(),
              calendarAccessGranted: false,
            })
            setIsFirstTimeUser(true)
            console.log('First-time user created:', user.uid)
          } else {
            setIsFirstTimeUser(false)
          }
        } catch (error) {
          console.error('Error checking/creating user document:', error)
        }
      }
    })
    return () => unsub()
  }, [auth, app])

  const requestCalendarAccess = async (): Promise<boolean> => {
    if (!authUser) {
      throw new Error('User must be signed in to request calendar access')
    }

    try {
      // Get OAuth URL from backend
      const idToken = await authUser.getIdToken()
      const response = await fetch('/api/calendar/request-access', {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to get OAuth URL')
      }

      const { oauthUrl } = await response.json()

      // Open OAuth popup
      const width = 500
      const height = 600
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      const popup = window.open(
        oauthUrl,
        'Google Calendar Authorization',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      )

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.')
      }

      // Wait for OAuth callback to complete
      return new Promise((resolve) => {
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed)
            // Check if calendar access was granted
            setTimeout(async () => {
              try {
                const userDoc = await getDoc(doc(db, 'users', authUser.uid))
                const userData = userDoc.data()
                const hasAccess = !!userData?.calendarAccessToken
                setHasCalendarAccess(hasAccess)
                resolve(hasAccess)
              } catch (error) {
                console.error('Error checking calendar access:', error)
                resolve(false)
              }
            }, 1000)
          }
        }, 500)

        // Listen for success message from callback
        const messageHandler = (event: MessageEvent) => {
          if (event.data.type === 'CALENDAR_AUTH_SUCCESS') {
            clearInterval(checkClosed)
            popup.close()
            setHasCalendarAccess(true)
            resolve(true)
            window.removeEventListener('message', messageHandler)
          } else if (event.data.type === 'CALENDAR_AUTH_ERROR') {
            clearInterval(checkClosed)
            popup.close()
            resolve(false)
            window.removeEventListener('message', messageHandler)
          }
        }

        window.addEventListener('message', messageHandler)
      })
    } catch (error: any) {
      console.error('Error requesting calendar access:', error)
      // If user closes popup, don't throw error - just return false
      if (error.code === 'auth/popup-closed-by-user' || error.message?.includes('popup')) {
        return false
      }
      throw error
    }
  }

  const value = useMemo<AuthContextValue>(() => ({
    app,
    authUser,
    isLoading,
    hasCalendarAccess,
    isFirstTimeUser,
    signInWithGoogle: async () => {
      try {
        const provider = new GoogleAuthProvider()
        await signInWithPopup(auth, provider)
      } catch (error: any) {
        // If user closes popup, don't throw error - just log it
        if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
          console.log('Sign-in cancelled by user')
          return
        }
        // Re-throw other errors
        throw error
      }
    },
    signOutUser: async () => {
      await signOut(auth)
      setHasCalendarAccess(false)
      setIsFirstTimeUser(false)
    },
    requestCalendarAccess,
  }), [app, authUser, isLoading, auth, hasCalendarAccess, isFirstTimeUser, db])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}


