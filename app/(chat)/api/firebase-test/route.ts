import { NextRequest } from 'next/server';
import { diagnoseFirebaseSetup } from '@/lib/db/queries';
import { auth } from '@/app/(auth)/auth';

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔍 Running Firebase diagnostics...');
    const diagnostics = await diagnoseFirebaseSetup();
    
    console.log('📊 Diagnostics result:', diagnostics);
    
    const response = {
      timestamp: new Date().toISOString(),
      user: {
        id: session.user.id,
        email: session.user.email,
        type: session.user.type
      },
      firebase: {
        success: diagnostics.success,
        issues: diagnostics.issues,
        recommendations: diagnostics.recommendations
      },
      environment: diagnostics.environment
    };

    if (diagnostics.success) {
      console.log('✅ Firebase diagnostics passed!');
      return Response.json(response);
    } else {
      console.log('❌ Firebase diagnostics failed:', diagnostics.issues);
      return Response.json(response, { status: 500 });
    }
  } catch (error) {
    console.error('❌ Firebase test route error:', error);
    return Response.json({
      error: 'Internal server error',
      details: (error as any)?.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 