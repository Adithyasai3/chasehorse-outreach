# ChaseHorse — AI-Powered Lead Intelligence & Outreach Platform

A full-stack, locally hosted AI-powered B2B Lead Generation, Company Intelligence, and Outreach Management Platform built specifically for **ChaseHorse** in the supply chain and logistics domain.

---

## 🚀 Key Capabilities

1. **Natural-Language Lead Discovery**:
   - Describe target accounts in plain English (e.g. *"Find D2C brands in India expanding into multiple cities that may require logistics services. Identify their founders and COOs"*).
   - Google Gemini parses intent into structured search parameters (geography, headcount size, industry, expansion signals, target decision-maker titles).

2. **Enricho MCP Integration**:
   - Remote Model Context Protocol connection to `https://mcp.enricho.co/mcp`.
   - Tool inspection (`company_search`, `person_search`, `account_usage`).
   - Preview vs full record credit estimation & controls (0 credits for company previews, 1 credit per verified contact record).
   - Built-in simulation fallback mode for offline evaluation without consuming live credits.

3. **Configurable Service Intelligence Module**:
   - Manages actual ChaseHorse service lines:
     - Multi-City Warehousing & Distributed Fulfillment
     - Inter-State Freight & Full Truckload (FTL) Transportation
     - Cold Chain & Temperature-Controlled Logistics
     - Reverse Logistics & Automated Return (RTO) Management
     - Cross-Border Freight Forwarding & Customs Clearance
   - AI evaluates leads strictly against this service catalog to return relevance scores, rationale, supporting evidence, and suggested cold outreach hooks.

4. **AI Research & Lead Qualification**:
   - Evaluates operational challenges, expansion signals, growth indicators.
   - Lead scoring from 0 to 100 with priority tiers (**High**, **Medium**, **Low**).
   - Rigorously separates verified factual claims from unverified assumptions.

5. **Personalized Email Generation**:
   - Generates peer-to-peer enterprise sales emails in 5 distinct styles: *Direct Business Introduction, Problem-Oriented, Partnership Opportunity, Warm Peer Introduction, Follow-up*.
   - Never sends emails without explicit human approval.

6. **Gmail Integration via Google OAuth 2.0**:
   - Official OAuth 2.0 consent and minimal scopes (`gmail.send`, `gmail.readonly`, `gmail.compose`).
   - Secure encrypted token storage at rest using AES-256-GCM.
   - Synchronizes incoming replies, identifies senders, associates replies with companies and contacts.
   - Triggers Gemini sentiment analysis and generates 1-click suggested replies.
   - Includes interactive "Simulate Incoming Reply" tester for instant local evaluation.

7. **Interactive Kanban CRM**:
   - 12 lifecycle stages: *Discovered, Researched, Contact Identified, Qualified, Ready to Outreach, Email Sent, Replied, Interested, Meeting Scheduled, Negotiation, Converted, Rejected*.
   - Drag-and-drop powered by `@dnd-kit`.
   - Company Workspace Drawer with 7 deep tabs (*Overview, Company Research, Contacts, Email History, AI Insights, Activities, Notes*).

8. **Follow-up Cadence & Reminders**:
   - Multi-touch cadence tracking (Day 0, Day 3, Day 7, Day 14).
   - Generates context-aware follow-up email drafts.
   - Enforces opt-out suppression lists before any outbound dispatch.

9. **Real Database Analytics**:
   - Real-time pipeline conversion funnel, industry distribution, geographic breakdown, reply rates, and AI token/credit logs.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons, dnd-kit |
| **Backend** | Node.js, Express.js, TypeScript, BullMQ, ioredis |
| **Database** | PostgreSQL 16, Prisma ORM |
| **AI Intelligence** | Google Gemini API (`gemini-2.5-flash`), structured tool-calling & schema validation |
| **Data Provider** | Enricho MCP (`https://mcp.enricho.co/mcp`) |
| **Email Protocol** | Gmail API, Google OAuth 2.0, RFC 2822 MIME generation |
| **Security** | AES-256-GCM encryption for OAuth tokens, opt-out suppression filtering |

---

## 📦 Installation & Local Setup

### Prerequisites
- **Node.js** (v20+ recommended)
- **Docker & Docker Compose** (for PostgreSQL and Redis)

### Step 1: Clone & Configure Environment Variables
```bash
cp .env.example .env
```
Fill in your configuration:
- `GEMINI_API_KEY`: Get from [Google AI Studio](https://aistudio.google.com/)
- `ENRICHO_API_KEY`: Optional; if blank, runs in intelligent simulation mode
- `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: From Google Cloud Console (see setup guide in `/integrations`)

### Step 2: Start PostgreSQL & Redis
```bash
# Starts PostgreSQL (port 5432) and Redis (port 6379)
npm run docker:up
```

### Step 3: Install Dependencies
```bash
# Root & Backend
cd backend
npm install
npx prisma generate
npx prisma db push
npm run seed

# Frontend
cd ../frontend
npm install
```

### Step 4: Run the Application
From the project root:
```bash
npm run dev
```
Or start individually:
- **Backend API**: `cd backend && npm run dev` (Runs on `http://localhost:5000`)
- **Frontend UI**: `cd frontend && npm run dev` (Runs on `http://localhost:3000`)

Open your browser at:
👉 **`http://localhost:3000`**

---

## 🧪 Testing the Complete Outreach Workflow

1. Navigate to **Lead Discovery** (`/discovery`).
2. Type or select a preset prompt:
   > *"Find D2C brands in India expanding into multiple cities and may require logistics services. Identify their founders and COOs."*
3. Click **Execute Discovery**.
4. Review discovered accounts, qualification scores, and identified decision-makers.
5. Go to **Kanban CRM** (`/kanban`) to view the pipeline. Click on any card to inspect the 7-tab company workspace.
6. Open **Email Inbox** (`/inbox`), click **Draft AI Outreach**, review the Gemini-generated pitch, and send.
7. Click **Simulate Incoming Reply** to test how incoming prospect responses trigger sentiment classification, advance the deal stage to *Replied*, and produce an AI-suggested response.
8. Check **Analytics** (`/analytics`) to see your real-time conversion funnel and industry distributions.
