import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting ChaseHorse database seeding...');

  // 1. Seed Kanban Stages (12 standard stages)
  const defaultStages = [
    { name: 'Discovered', key: 'discovered', order: 1, color: '#94a3b8' },
    { name: 'Researched', key: 'researched', order: 2, color: '#64748b' },
    { name: 'Contact Identified', key: 'contact_identified', order: 3, color: '#38bdf8' },
    { name: 'Qualified', key: 'qualified', order: 4, color: '#3b82f6' },
    { name: 'Ready to Outreach', key: 'ready_to_outreach', order: 5, color: '#6366f1' },
    { name: 'Email Sent', key: 'email_sent', order: 6, color: '#8b5cf6' },
    { name: 'Replied', key: 'replied', order: 7, color: '#ec4899' },
    { name: 'Interested', key: 'interested', order: 8, color: '#10b981' },
    { name: 'Meeting Scheduled', key: 'meeting_scheduled', order: 9, color: '#06b6d4' },
    { name: 'Negotiation', key: 'negotiation', order: 10, color: '#f59e0b' },
    { name: 'Converted', key: 'converted', order: 11, color: '#22c55e' },
    { name: 'Rejected', key: 'rejected', order: 12, color: '#ef4444' },
  ];

  for (const stage of defaultStages) {
    await prisma.kanbanStage.upsert({
      where: { key: stage.key },
      update: { name: stage.name, order: stage.order, color: stage.color },
      create: stage,
    });
  }
  console.log(`✅ Seeded ${defaultStages.length} Kanban stages.`);

  // 2. Seed ChaseHorse Service Catalog (Configurable Service Intelligence Module)
  const chaseHorseServices = [
    {
      name: 'Multi-City Warehousing & Distributed Fulfillment',
      slug: 'multi-city-warehousing',
      description:
        'Strategic network of Grade-A tech-enabled fulfillment centers across tier-1 and tier-2 consumption hubs in India, enabling 24-48 hour dispatch and localized delivery.',
      targetIndustries: ['D2C', 'E-commerce', 'Retail', 'Consumer Goods', 'FMCG'],
      targetCompanySizes: ['11-50', '51-200', '201-500', '501-1000'],
      businessProblems: [
        'High shipping transit times causing shopping cart abandonment',
        'Exorbitant air freight costs for cross-zone shipping',
        'Lack of real-time inventory visibility across scattered regional 3PLs',
        'High RTO (Return to Origin) rates on Cash on Delivery orders',
      ],
      valueProposition:
        'Reduce shipping costs by 30-40% through localized regional stocking and achieve 98.5% same-day dispatch SLAs with seamless ERP/Shopify integration.',
      caseStudies:
        'Helped an organic skincare D2C brand scale from 15k to 95k monthly orders across North and South zones while cutting transit times by 42%.',
      isActive: true,
    },
    {
      name: 'Inter-State Freight & Full Truckload (FTL) Transportation',
      slug: 'interstate-freight-ftl',
      description:
        'GPS-tracked, SLA-backed line-haul and inter-state full truckload (FTL) and part truckload (PTL) transportation with guaranteed vehicle placement and verified driver pool.',
      targetIndustries: ['Manufacturing', 'Industrial', 'FMCG', 'Automotive', 'Import and export'],
      targetCompanySizes: ['51-200', '201-500', '501-1000', '1000+'],
      businessProblems: [
        'Unreliable vehicle availability during seasonal demand spikes',
        'Lack of in-transit visibility and unpredictable transit delays',
        'Excessive transit damages and lack of transit insurance claims support',
        'Fragmented fleet broker billing and opaque pricing',
      ],
      valueProposition:
        'Guaranteed vehicle placement within 2 hours, live telematics tracking, and standardized digital ePODs that speed up billing reconciliation by 14 days.',
      caseStudies:
        'Consolidated freight operations for a Tier-1 auto parts supplier across 4 factories in Gujarat and Tamil Nadu, cutting detention losses by 65%.',
      isActive: true,
    },
    {
      name: 'Cold Chain & Temperature-Controlled Logistics',
      slug: 'cold-chain-logistics',
      description:
        'End-to-end active and passive temperature-controlled storage and refrigerated reefer transportation maintaining 2°C to 8°C and -20°C with automated data loggers.',
      targetIndustries: ['Pharmaceuticals', 'FMCG', 'Dairy', 'Biotech', 'Food Processing'],
      targetCompanySizes: ['11-50', '51-200', '201-500', '501-1000'],
      businessProblems: [
        'Temperature excursion risks during multi-modal transit',
        'Stringent compliance audits and GDP (Good Distribution Practice) mandates',
        'Lack of continuous real-time temperature audit trails for regulators',
      ],
      valueProposition:
        'Zero-excursion compliance with IoT temperature sensors sending alerts every 60 seconds, backed by pre-qualified validated shippers and pharma-grade reefers.',
      caseStudies:
        'Successfully handled nationwide vaccine and active biologic distribution for an emerging pharmaceutical brand across 28 states with zero temperature excursions.',
      isActive: true,
    },
    {
      name: 'Reverse Logistics & Automated Return (RTO) Management',
      slug: 'reverse-logistics-returns',
      description:
        'High-speed automated returns processing including doorstep quality verification, rapid re-induction into inventory, and packaging refurbishment.',
      targetIndustries: ['E-commerce', 'D2C', 'Retail', 'Consumer Electronics', 'Fashion'],
      targetCompanySizes: ['11-50', '51-200', '201-500', '501-1000'],
      businessProblems: [
        'Returned merchandise trapped in transit for weeks leading to inventory obsolescence',
        'Fraudulent return claims and damaged goods acceptance',
        'Poor customer return experience damaging brand repurchase rates',
      ],
      valueProposition:
        'Turn returned stock back into sellable inventory within 72 hours, reducing working capital lockup by 45% and eliminating return fraud at point of pickup.',
      caseStudies:
        'Reduced return processing cycle time from 18 days to 3.2 days for a fast-fashion D2C brand, recovering ₹1.8 Cr in previously trapped seasonal inventory.',
      isActive: true,
    },
    {
      name: 'Cross-Border Freight Forwarding & Customs Clearance',
      slug: 'cross-border-freight-forwarding',
      description:
        'Integrated ocean and air freight forwarding with dedicated in-house customs clearance, bill of entry automation, and port drayage coordination.',
      targetIndustries: ['Import and export', 'Manufacturing', 'Industrial', 'Chemicals', 'Electronics'],
      targetCompanySizes: ['51-200', '201-500', '501-1000', '1000+'],
      businessProblems: [
        'Demurrage and detention fees caused by slow documentation',
        'Volatile ocean freight container spot rates and booking cancellations',
        'Complex customs classification and changing tariff barriers',
      ],
      valueProposition:
        'Fixed seasonal shipping space commitments with major ocean liners, zero-demurrage guarantee on documentation, and end-to-end single invoice clearance.',
      caseStudies:
        'Handled 240+ TEU imports annually for an industrial machinery maker, reducing clearance turnaround from 6 days to under 36 hours at Nhava Sheva port.',
      isActive: true,
    },
  ];

  for (const s of chaseHorseServices) {
    await prisma.service.upsert({
      where: { slug: s.slug },
      update: s,
      create: s,
    });
  }
  console.log(`✅ Seeded ${chaseHorseServices.length} ChaseHorse services.`);

  // 3. Seed Default Integrations Status
  const integrations = [
    {
      provider: 'ENRICHO_MCP',
      status: 'CONNECTED',
      config: {
        serverUrl: 'https://mcp.enricho.co/mcp',
        supportedTools: ['company_search', 'person_search', 'account_usage'],
        creditBalance: 250,
      },
    },
    {
      provider: 'GEMINI_AI',
      status: 'CONNECTED',
      config: {
        model: 'gemini-2.5-flash',
        supportedFeatures: [
          'search_interpretation',
          'company_qualification',
          'service_matching',
          'email_generation',
          'reply_classification',
        ],
      },
    },
    {
      provider: 'GMAIL',
      status: 'DISCONNECTED',
      config: {
        connectedEmail: null,
        scopes: ['gmail.readonly', 'gmail.send', 'gmail.compose', 'userinfo.email'],
      },
    },
  ];

  for (const item of integrations) {
    await prisma.integration.upsert({
      where: { provider: item.provider },
      update: { status: item.status, config: item.config },
      create: { provider: item.provider, status: item.status, config: item.config },
    });
  }
  console.log(`✅ Seeded ${integrations.length} system integrations.`);

  // 4. Seed initial realistic prospective companies
  const stageDiscovered = await prisma.kanbanStage.findUnique({ where: { key: 'discovered' } });
  const stageResearched = await prisma.kanbanStage.findUnique({ where: { key: 'researched' } });
  const stageContactIdentified = await prisma.kanbanStage.findUnique({ where: { key: 'contact_identified' } });
  const stageQualified = await prisma.kanbanStage.findUnique({ where: { key: 'qualified' } });
  const stageReady = await prisma.kanbanStage.findUnique({ where: { key: 'ready_to_outreach' } });
  const stageReplied = await prisma.kanbanStage.findUnique({ where: { key: 'replied' } });

  const warehousingService = await prisma.service.findUnique({ where: { slug: 'multi-city-warehousing' } });
  const freightService = await prisma.service.findUnique({ where: { slug: 'interstate-freight-ftl' } });
  const coldChainService = await prisma.service.findUnique({ where: { slug: 'cold-chain-logistics' } });

  // Company 1: Aadvik Foods (Camel Milk & Dairy D2C expanding multi-city)
  const comp1 = await prisma.company.upsert({
    where: { domain: 'aadvikfoods.com' },
    update: {},
    create: {
      name: 'Aadvik Foods',
      domain: 'aadvikfoods.com',
      website: 'https://aadvikfoods.com',
      industry: 'FMCG',
      subIndustry: 'Dairy & Specialized Nutrition',
      country: 'India',
      state: 'Rajasthan',
      city: 'Jaipur',
      headcount: '51-200',
      employeeCount: 110,
      foundedYear: 2016,
      businessModel: 'D2C & B2B Retail',
      leadScore: 92,
      qualificationPriority: 'HIGH',
      qualificationReason:
        'Expanding from Western India into South & East regional retail hubs; perishable cold-chain and distributed warehousing required to eliminate product spoilage and reduce delivery times.',
      source: 'ENRICHO_MCP',
      sourceQuery: 'Find FMCG and D2C brands in India expanding distribution',
      kanbanStageId: stageReady?.id,
      contacts: {
        create: [
          {
            fullName: 'Hitesh Rathi',
            firstName: 'Hitesh',
            lastName: 'Rathi',
            email: 'hitesh.rathi@aadvikfoods.com',
            isEmailVerified: true,
            title: 'Co-Founder & CEO',
            role: 'Executive',
            seniority: 'founder',
            linkedinUrl: 'https://linkedin.com/in/hitesh-rathi-aadvik',
            isPrimary: true,
          },
          {
            fullName: 'Sanjay Sharma',
            firstName: 'Sanjay',
            lastName: 'Sharma',
            email: 'sanjay.sharma@aadvikfoods.com',
            isEmailVerified: true,
            title: 'Head of Operations & Supply Chain',
            role: 'Operations',
            seniority: 'head',
            linkedinUrl: 'https://linkedin.com/in/sanjay-sharma-ops',
            isPrimary: false,
          },
        ],
      },
      research: {
        create: {
          operationalChallenges: [
            'Short shelf-life of freeze-dried camel milk requires strictly monitored cold-chain storage.',
            'High cross-country shipping costs from Rajasthan manufacturing facility to South India metro customers.',
            'Delivery delays during summer months risking temperature breaches in standard transit.',
          ],
          expansionSignals: [
            'Announced expansion into 1,200 modern retail counters in Bengaluru, Hyderabad, and Chennai.',
            'Hiring regional supply chain managers in Mumbai and NCR.',
            'Recent ₹15 Cr growth capital raised to scale direct consumer supply chain.',
          ],
          growthIndicators: [
            '45% YoY increase in direct website shipments.',
            'Opened new distribution hubs in Delhi NCR.',
          ],
          businessDevelopments:
            'Aadvik Foods launched a new range of camel and goat milk chocolates and skincare products, expanding SKUs from 14 to 38.',
          verifiedClaims: [
            'Founded in 2016 in Jaipur, Rajasthan [https://aadvikfoods.com/about-us]',
            'Product catalog spans milk powder, ghee, and skincare [Verified website catalog]',
          ],
          unverifiedInferences: [
            'Likely reliant on 3rd party spot couriers without temperature logs for non-frozen items.',
            'Projected 35% margin leak from cross-zone air shipping from Rajasthan hub.',
          ],
          researchSources: [
            'https://aadvikfoods.com',
            'https://economictimes.indiatimes.com/tech/startups/aadvik-foods-expansion',
          ],
        },
      },
      activities: {
        create: [
          {
            type: 'STATUS_CHANGE',
            title: 'Lead Discovered & Enriched',
            description: 'Enricho MCP matched company and pulled 2 verified decision makers.',
          },
          {
            type: 'RESEARCH_UPDATED',
            title: 'AI Qualification Completed',
            description: 'Gemini scored lead 92/100 due to multi-city cold-chain logistics expansion.',
          },
        ],
      },
    },
  });

  if (coldChainService && comp1) {
    await prisma.companyServiceMatch.upsert({
      where: {
        companyId_serviceId: {
          companyId: comp1.id,
          serviceId: coldChainService.id,
        },
      },
      update: {},
      create: {
        companyId: comp1.id,
        serviceId: coldChainService.id,
        relevanceScore: 95,
        whyRelevant:
          'Aadvik produces temperature-sensitive dairy and nutrition items currently dispatched from a single state, resulting in high freight cost and temperature breach risks.',
        supportingEvidence:
          'Expanded retail distribution in 5 southern metros requires 2-8°C warehousing and continuous temperature IoT audit trails.',
        targetDecisionMaker: 'Sanjay Sharma (Head of Operations & Supply Chain)',
        outreachAngle:
          'SLA-backed zero-excursion cold storage in Bengaluru and Mumbai to cut transit times from 5 days to same-day delivery.',
        confidenceScore: 0.94,
      },
    });
  }

  // Company 2: Ather Energy (Electric 2-Wheelers Manufacturing & Spares Logistics)
  const comp2 = await prisma.company.upsert({
    where: { domain: 'atherenergy.com' },
    update: {},
    create: {
      name: 'Ather Energy',
      domain: 'atherenergy.com',
      website: 'https://atherenergy.com',
      industry: 'Manufacturing',
      subIndustry: 'Electric Vehicles & Clean Mobility',
      country: 'India',
      state: 'Karnataka',
      city: 'Bengaluru',
      headcount: '1000+',
      employeeCount: 1800,
      foundedYear: 2013,
      businessModel: 'B2C & B2B Manufacturing',
      leadScore: 88,
      qualificationPriority: 'HIGH',
      qualificationReason:
        'Rapid nationwide experience center and battery charging network rollout requires dedicated inter-state spare parts line-haul logistics and Tier-2 city regional inventory depots.',
      source: 'ENRICHO_MCP',
      sourceQuery: 'Find manufacturing companies in India with 500+ employees',
      kanbanStageId: stageQualified?.id,
      contacts: {
        create: [
          {
            fullName: 'Tarun Mehta',
            firstName: 'Tarun',
            lastName: 'Mehta',
            email: 'tarun.m@atherenergy.com',
            isEmailVerified: true,
            title: 'Co-Founder & CEO',
            role: 'Executive',
            seniority: 'founder',
            linkedinUrl: 'https://linkedin.com/in/tarunmehta-ather',
            isPrimary: false,
          },
          {
            fullName: 'Vikramjit Singh',
            firstName: 'Vikramjit',
            lastName: 'Singh',
            email: 'vikramjit.s@atherenergy.com',
            isEmailVerified: true,
            title: 'VP of Supply Chain & Manufacturing Operations',
            role: 'Supply Chain',
            seniority: 'vp',
            linkedinUrl: 'https://linkedin.com/in/vikramjit-singh-ather',
            isPrimary: true,
          },
        ],
      },
      research: {
        create: {
          operationalChallenges: [
            'Severe downtime penalties if critical electronic control units (ECUs) or lithium cells are delayed in inter-state freight transit.',
            'Spares replenishment to 180+ service centers requires guaranteed vehicle placement within tight delivery windows.',
          ],
          expansionSignals: [
            'Commissioned 2nd manufacturing facility in Hosur, doubling capacity to 420,000 units annually.',
            'Expanding retail touchpoints from 100 cities to 220 tier-2 and tier-3 cities.',
          ],
          growthIndicators: [
            'Filed IPO paperwork; aggressive expansion into international markets including Nepal.',
          ],
          businessDevelopments:
            'Launched Rizta family electric scooter, generating high initial order volumes and increasing spares logistics complexity.',
          verifiedClaims: [
            'Dual manufacturing plants located in Hosur, Tamil Nadu [Official corporate release]',
            '180+ retail Ather Space showrooms active across India [Dealer locator]',
          ],
          unverifiedInferences: [
            'Potential bottlenecks in inter-state truck turnaround times between Tamil Nadu plant and North India hubs.',
          ],
          researchSources: ['https://atherenergy.com', 'https://autocarpro.in/ather-energy-expansion'],
        },
      },
    },
  });

  if (freightService && comp2) {
    await prisma.companyServiceMatch.upsert({
      where: {
        companyId_serviceId: {
          companyId: comp2.id,
          serviceId: freightService.id,
        },
      },
      update: {},
      create: {
        companyId: comp2.id,
        serviceId: freightService.id,
        relevanceScore: 91,
        whyRelevant:
          'High-value manufacturing with daily line-haul movements between Hosur manufacturing plants and 220+ service points across India.',
        supportingEvidence:
          'Ather recently expanded production to 400k+ annual capacity; requires dedicated GPS-tracked FTL trailers with guaranteed 2-hour placement.',
        targetDecisionMaker: 'Vikramjit Singh (VP of Supply Chain & Manufacturing Operations)',
        outreachAngle:
          'Guaranteed vehicle placement and digital ePOD tracking to eliminate transit damage claims on lithium-ion batteries and sub-assemblies.',
        confidenceScore: 0.92,
      },
    });
  }

  // Company 3: Blissclub (High-growth Women Activewear D2C)
  const comp3 = await prisma.company.upsert({
    where: { domain: 'blissclub.com' },
    update: {},
    create: {
      name: 'Blissclub',
      domain: 'blissclub.com',
      website: 'https://blissclub.com',
      industry: 'D2C',
      subIndustry: 'Apparel & Athleisure',
      country: 'India',
      state: 'Karnataka',
      city: 'Bengaluru',
      headcount: '51-200',
      employeeCount: 140,
      foundedYear: 2020,
      businessModel: 'D2C & Omnichannel Retail',
      leadScore: 86,
      qualificationPriority: 'HIGH',
      qualificationReason:
        'High D2C return (RTO) rate typical of apparel (25-30%) and omni-channel retail store rollout creates urgent need for automated reverse logistics and multi-city inventory pooling.',
      source: 'ENRICHO_MCP',
      sourceQuery: 'Find D2C brands in India expanding into multiple cities',
      kanbanStageId: stageReplied?.id,
      contacts: {
        create: [
          {
            fullName: 'Minu Margeret',
            firstName: 'Minu',
            lastName: 'Margeret',
            email: 'minu@blissclub.com',
            isEmailVerified: true,
            title: 'Founder & CEO',
            role: 'Executive',
            seniority: 'founder',
            linkedinUrl: 'https://linkedin.com/in/minumargeret',
            isPrimary: true,
          },
          {
            fullName: 'Abhishek Roy',
            firstName: 'Abhishek',
            lastName: 'Roy',
            email: 'abhishek.roy@blissclub.com',
            isEmailVerified: true,
            title: 'Director of Supply Chain & Customer Experience',
            role: 'Operations',
            seniority: 'director',
            linkedinUrl: 'https://linkedin.com/in/abhishek-roy-ops',
            isPrimary: false,
          },
        ],
      },
      research: {
        create: {
          operationalChallenges: [
            'Size exchange and returns in women activewear average 28%, tying up capital in reverse transit.',
            'Opening 15 physical retail stores across Mumbai, Delhi, and Bengaluru demands unified inventory between online and offline stores.',
          ],
          expansionSignals: [
            'Raised $15M Series A from Elevation Capital and marquee angels.',
            'Expanded into retail stores across top Tier-1 shopping malls.',
          ],
          growthIndicators: [
            'Shipped over 2 million units in past 18 months.',
          ],
          businessDevelopments:
            'Launched new category lines in outerwear and maternity activewear, expanding warehouse SKU velocity.',
          verifiedClaims: [
            'Founded by Minu Margeret in 2020 [YourStory interview]',
            '15+ offline brand stores launched across Mumbai, Bangalore, and Delhi [Retail news]',
          ],
          unverifiedInferences: [
            'High reverse logistics overhead and 12-day turnaround for returned stock restock.',
          ],
          researchSources: ['https://blissclub.com', 'https://yourstory.com/2022/05/elevation-capital-blissclub'],
        },
      },
    },
  });

  if (warehousingService && comp3) {
    await prisma.companyServiceMatch.upsert({
      where: {
        companyId_serviceId: {
          companyId: comp3.id,
          serviceId: warehousingService.id,
        },
      },
      update: {},
      create: {
        companyId: comp3.id,
        serviceId: warehousingService.id,
        relevanceScore: 89,
        whyRelevant:
          'Blissclub ships 150k+ monthly packages across India with significant concentration in Delhi NCR and Mumbai, but dispatches primarily from Bengaluru.',
        supportingEvidence:
          'Omnichannel store replenishment plus D2C e-commerce demands decentralized inventory to hit 1-day delivery SLAs.',
        targetDecisionMaker: 'Abhishek Roy (Director of Supply Chain & Customer Experience)',
        outreachAngle:
          'Distributed warehousing in NCR and Bhiwandi to drop transit times to 24 hours and recover ₹40L/month in cross-zone freight premiums.',
        confidenceScore: 0.91,
      },
    });

    // Add an incoming sample email thread to demonstrate reply tracking
    const thread = await prisma.emailThread.upsert({
      where: { gmailThreadId: 'thread_blissclub_demo_001' },
      update: {},
      create: {
        gmailThreadId: 'thread_blissclub_demo_001',
        subject: 'Re: Optimizing Blissclub North India Fulfillment & RTO turnaround',
        companyId: comp3.id,
        contactId: comp3.contacts[0]?.id,
        messagesCount: 2,
        hasReplies: true,
        status: 'ACTIVE',
        messages: {
          create: [
            {
              gmailMessageId: 'msg_blissclub_out_001',
              direction: 'OUTBOUND',
              fromEmail: 'outreach@chasehorse.com',
              toEmail: 'minu@blissclub.com',
              subject: 'Optimizing Blissclub North India Fulfillment & RTO turnaround',
              bodyText:
                'Hi Minu,\n\nCongratulations on the recent launch of your retail store in Gurgaon! As you scale Blissclub across NCR, notice you might be fulfilling northern orders from the Bengaluru hub.\n\nChaseHorse operates Grade-A fulfillment centers in Delhi NCR with automated 72-hour reverse logistics processing, which has helped similar activewear brands cut RTO turnaround by 60%.\n\nWould you be open to a 10-minute chat next Tuesday?\n\nBest,\nChaseHorse Team',
              sentAt: new Date(Date.now() - 86400000 * 2),
            },
            {
              gmailMessageId: 'msg_blissclub_in_002',
              direction: 'INBOUND',
              fromEmail: 'minu@blissclub.com',
              toEmail: 'outreach@chasehorse.com',
              subject: 'Re: Optimizing Blissclub North India Fulfillment & RTO turnaround',
              bodyText:
                'Hi Team ChaseHorse,\n\nThanks for reaching out. Yes, we are actually evaluating regional warehouse options in NCR right now to support both our retail store replenishment and D2C express shipping.\n\nCould you share your rate card and facility specs in Bilaspur / Gurgaon? Also looping in Abhishek who heads our operations.\n\nBest,\nMinu',
              snippet:
                'Thanks for reaching out. Yes, we are actually evaluating regional warehouse options in NCR right now...',
              receivedAt: new Date(Date.now() - 3600000 * 4),
              sentiment: 'POSITIVE',
              intent: 'INTERESTED',
              suggestedReply:
                'Hi Minu & Abhishek,\n\nDelighted to hear that! Attached are our NCR facility specifications (100k sq ft Grade-A in Bilaspur) and standard rate card with automated 72-hour return restocking.\n\nHow does Thursday at 3:00 PM IST work for a quick video walk-through with our operations director?',
            },
          ],
        },
      },
    });

    // Add a follow-up reminder
    await prisma.followUp.create({
      data: {
        companyId: comp3.id,
        contactId: comp3.contacts[0]?.id,
        title: 'Send NCR rate card & schedule video walkthrough with Minu and Abhishek',
        dueDate: new Date(Date.now() + 86400000 * 1),
        sequenceStep: 2,
        reminderDays: 1,
        status: 'PENDING',
        notes: 'Prospect expressed positive interest in Bilaspur hub. High priority deal.',
      },
    });
  }

  console.log('✅ Seeded 3 high-detail qualified companies with contacts, research, service matches, and reply threads.');
  console.log('🎉 Seeding successfully completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
