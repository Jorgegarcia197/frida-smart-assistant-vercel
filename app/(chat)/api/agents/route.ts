import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'User email not found in session' },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email') || session.user.email;

    // Step 1: Get userId from /api/user
    const userApiUrl = `https://staging.d1cfcx1bhpwhyf.amplifyapp.com/api/user?email=${encodeURIComponent(email)}`;

    const userResponse = await fetch(userApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!userResponse.ok) {
      console.error(
        'User API error:',
        userResponse.status,
        userResponse.statusText,
      );
      return NextResponse.json(
        { error: 'Failed to fetch user ID from external API' },
        { status: userResponse.status },
      );
    }

    const userData = await userResponse.json();

    if (!userData.success || !userData.userId) {
      return NextResponse.json(
        { error: 'Invalid user data received from external API' },
        { status: 400 },
      );
    }

    // Step 2: Get agents using the userId
    const agentsApiUrl = `https://staging.d1cfcx1bhpwhyf.amplifyapp.com/api/agents?createdBy=${encodeURIComponent(userData.userId)}&userEmail=${encodeURIComponent(email)}`;

    const agentsResponse = await fetch(agentsApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!agentsResponse.ok) {
      console.error(
        'Agents API error:',
        agentsResponse.status,
        agentsResponse.statusText,
      );
      return NextResponse.json(
        { error: 'Failed to fetch agents from external API' },
        { status: agentsResponse.status },
      );
    }

    const agentsData = await agentsResponse.json();
    console.log('Agents data:', agentsData);

    // Return the agents data from external API
    return NextResponse.json(agentsData);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 },
    );
  }
}
