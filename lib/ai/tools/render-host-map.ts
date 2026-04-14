import { tool } from 'ai';
import { z } from 'zod';

const hostLocationSchema = z.object({
  host: z.string().describe('Host or server name'),
  location: z.string().describe('City or locality name'),
  state: z.string().nullable().describe('State or region'),
  country: z.string().nullable().describe('Country name or ISO code'),
  lat: z.number().describe('Latitude (approximate if exact is unknown)'),
  lng: z.number().describe('Longitude (approximate if exact is unknown)'),
});

export type HostLocation = z.infer<typeof hostLocationSchema>;

export const renderHostMap = tool({
  description:
    'Render an interactive map showing host/server locations. Call this when the user asks to see locations on a map. Provide approximate lat/lng coordinates based on city/state knowledge when exact coordinates are unavailable.',
  inputSchema: z.object({
    title: z.string().describe('Short title for the map (e.g. "AMT Hosts in USA")'),
    hosts: z
      .array(hostLocationSchema)
      .min(1)
      .describe('Array of host entries with coordinates'),
  }),
  execute: async ({ title, hosts }) => {
    return { title, hosts, markerCount: hosts.length };
  },
});
