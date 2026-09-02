import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/authorization'
import { isSessionPayload } from '@/lib/auth/server'
import { PERMISSION_DEFINITIONS } from '@/lib/auth/permissions'

export async function GET() {
  const session = await requirePermission('role:read')
  if (!isSessionPayload(session)) return session
  return NextResponse.json({ permissions: PERMISSION_DEFINITIONS })
}
