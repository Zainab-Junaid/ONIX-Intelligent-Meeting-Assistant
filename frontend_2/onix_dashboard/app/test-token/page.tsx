"use client"

import { useAuth } from '@/components/auth-provider'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function TestTokenPage() {
  const { authUser } = useAuth()
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const getToken = async () => {
    if (!authUser) {
      alert('Please log in first')
      return
    }
    try {
      const idToken = await authUser.getIdToken()
      setToken(idToken)
      console.log('Token:', idToken)
      console.log('UID:', authUser.uid)
    } catch (error) {
      console.error('Error getting token:', error)
      alert('Error getting token: ' + (error as Error).message)
    }
  }

  const createTestData = async () => {
    if (!token) {
      alert('Please get token first')
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/meeting-bot/test-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ count: 2 })
      })
      const data = await response.json()
      setResult(data)
      if (data.success) {
        alert('✅ Test data created! Check the console for details.')
      } else {
        alert('❌ Error: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error creating test data:', error)
      alert('Error: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">Test Token & Create Test Data</h1>
      
      <div className="space-y-4">
        <div className="p-4 border rounded">
          <p className="mb-2">
            <strong>User:</strong> {authUser ? authUser.email : 'Not logged in'}
          </p>
          <p className="mb-4">
            <strong>UID:</strong> {authUser ? authUser.uid : 'N/A'}
          </p>
          
          <Button onClick={getToken} className="mr-2">
            Get Token
          </Button>
          
          {token && (
            <div className="mt-4 p-3 bg-gray-100 rounded text-xs break-all">
              <strong>Token:</strong> {token.substring(0, 50)}...
            </div>
          )}
        </div>

        <div className="p-4 border rounded">
          <h2 className="font-semibold mb-2">Create Test Bot Data</h2>
          <p className="text-sm text-gray-600 mb-4">
            This will create 2 test meetings in the bot database for testing the integration.
          </p>
          
          <Button 
            onClick={createTestData} 
            disabled={!token || loading}
            className="mr-2"
          >
            {loading ? 'Creating...' : 'Create Test Data'}
          </Button>

          {result && (
            <div className="mt-4 p-3 bg-gray-100 rounded">
              <pre className="text-xs overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="p-4 border rounded bg-blue-50">
          <h3 className="font-semibold mb-2">Instructions:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Make sure you're logged in</li>
            <li>Click "Get Token" to get your Firebase token</li>
            <li>Click "Create Test Data" to create test meetings</li>
            <li>Go back to the dashboard to see your test meetings</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

