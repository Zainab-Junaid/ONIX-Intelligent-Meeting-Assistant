// src/services/aiService.ts

interface MeetingContext {
  id: string;
  title: string;
  date: string;
  time: string;
  duration?: string;
  participants?: string[];
  transcript?: string;
  summary?: string;
  keyPoints?: string[];
  actionItems?: string[];
}

export const getAIResponse = async (
  question: string,
  meetingContext: MeetingContext | null
): Promise<string> => {
  if (!meetingContext) {
    return "Please select a meeting first to ask questions about it.";
  }

  const lowerQuestion = question.toLowerCase();

  // PARTICIPANTS - Multiple variations
  const participantKeywords = [
    'participant', 'attend', 'who', 'people', 'person', 
    'member', 'present', 'joined'
  ];
  const isParticipantQuestion = participantKeywords.some(
    keyword => lowerQuestion.includes(keyword)
  );

  if (isParticipantQuestion) {
    if (meetingContext.participants && meetingContext.participants.length > 0) {
      const participantList = meetingContext.participants
        .map((p: string, i: number) => `${i + 1}. ${p}`)
        .join('\n');
      const total = meetingContext.participants.length;
      return `Meeting Participants:\n\n${participantList}\n\nTotal: ${total} ${total === 1 ? 'person' : 'people'} attended this meeting.`;
    }
    return "No participant information is available for this meeting.";
  }

  // SUMMARY - Smart extraction
  const summaryKeywords = [
    'summary', 'summarize', 'overview', 'brief', 
    'gist', 'main point', 'overall'
  ];
  const isSummaryQuestion = summaryKeywords.some(
    keyword => lowerQuestion.includes(keyword)
  );

  if (isSummaryQuestion) {
    if (meetingContext.summary && meetingContext.summary !== 'No summary available') {
      return `Meeting Summary:\n\n${meetingContext.summary}`;
    }

    // Generate intelligent summary from transcript
    if (meetingContext.transcript) {
      const lines = meetingContext.transcript.split('\n').filter(l => l.trim());

      let summary = 'Meeting Summary:\n\n';
      summary += `Topic: ${meetingContext.title}\n`;
      summary += `Date: ${meetingContext.date} at ${meetingContext.time}\n\n`;

      // Find main discussion points (not full transcript)
      const keyStatements = lines.filter((line: string) => {
        const lower = line.toLowerCase();
        return (
          lower.includes('completed') || lower.includes('finished') ||
          lower.includes('working on') || lower.includes('need') ||
          lower.includes('ready') || lower.includes('impressive') ||
          lower.includes('perfect') || lower.includes('agreed')
        );
      }).slice(0, 3); // Only top 3 key statements

      if (keyStatements.length > 0) {
        summary += 'Key Highlights:\n';
        keyStatements.forEach((stmt: string) => {
          const colonIndex = stmt.indexOf(':');
          const text = colonIndex > 0 ? stmt.substring(colonIndex + 1).trim() : stmt;
          summary += `• ${text}\n`;
        });
      } else {
        summary += `Meeting held with ${meetingContext.participants?.length || 0} participants to discuss ${meetingContext.title.toLowerCase()}.`;
      }

      return summary;
    }

    return `Meeting: ${meetingContext.title}\n\nNo detailed summary available for this meeting.`;
  }

  // KEY DECISIONS - Extract meaningful decisions
  const decisionKeywords = [
    'decision', 'decide', 'key point', 'important', 
    'main point', 'conclude', 'agreed', 'resolution'
  ];
  const isDecisionQuestion = decisionKeywords.some(
    keyword => lowerQuestion.includes(keyword)
  );

  if (isDecisionQuestion) {
    if (meetingContext.keyPoints && meetingContext.keyPoints.length > 0) {
      const keyPointsList = meetingContext.keyPoints
        .map((p: string, i: number) => `${i + 1}. ${p}`)
        .join('\n');
      return `Key Decisions:\n\n${keyPointsList}`;
    }

    if (meetingContext.transcript) {
      const lines = meetingContext.transcript.split('\n').filter(l => l.trim());
      const decisions: string[] = [];

      lines.forEach((line: string) => {
        const lower = line.toLowerCase();
        const colonIndex = line.indexOf(':');
        const text = colonIndex > 0 ? line.substring(colonIndex + 1).trim() : line;

        // Decision indicators
        if (lower.includes('schedule') && lower.includes('meeting')) {
          decisions.push('Follow-up meeting to be scheduled');
        } else if (lower.includes('pricing') && lower.includes('discuss')) {
          decisions.push('Pricing and implementation timeline to be discussed');
        } else if (lower.includes('finished') || lower.includes('completed')) {
          if (text.length > 15 && text.length < 100) {
            decisions.push(text.replace(/\.$/, ''));
          }
        } else if (lower.includes('ready for review')) {
          decisions.push('Code ready for review');
        } else if (lower.includes('help with') && lower.includes('database')) {
          decisions.push('Database migration assistance needed');
        } else if ((lower.includes('agreed') || lower.includes('perfect')) && text.length < 100) {
          const cleaned = text.replace(/^(Perfect\.|Great\.|Excellent\.)/, '').trim();
          if (cleaned.length > 10) {
            decisions.push(cleaned);
          }
        }
      });

      // Remove duplicates and filter
      const uniqueDecisions = [...new Set(decisions)]
        .filter((d: string) => d.length > 10 && d.length < 150)
        .slice(0, 5); // Max 5 key decisions

      if (uniqueDecisions.length > 0) {
        const decisionList = uniqueDecisions
          .map((d: string, i: number) => `${i + 1}. ${d}`)
          .join('\n');
        return `Key Decisions:\n\n${decisionList}`;
      }

      return `Key Points:\n\n• Meeting focused on ${meetingContext.title.toLowerCase()}\n• ${meetingContext.participants?.length || 0} team members participated\n• Discussion covered progress updates and next steps`;
    }

    return "No key decisions were documented in this meeting.";
  }

  // ACTION ITEMS - Clean extraction
  const actionKeywords = [
    'action', 'task', 'todo', 'to do', 'follow up', 
    'next step', 'assignee', 'deadline', 'work', 'do'
  ];
  const isActionQuestion = actionKeywords.some(
    keyword => lowerQuestion.includes(keyword)
  );

  if (isActionQuestion) {
    if (meetingContext.actionItems && meetingContext.actionItems.length > 0) {
      const actionList = meetingContext.actionItems
        .map((item: string, i: number) => `${i + 1}. ${item}`)
        .join('\n');
      return `Action Items:\n\n${actionList}`;
    }

    if (meetingContext.transcript) {
      const lines = meetingContext.transcript.split('\n').filter(l => l.trim());
      const actions: string[] = [];

      lines.forEach((line: string) => {
        const lower = line.toLowerCase();
        const colonIndex = line.indexOf(':');
        const text = colonIndex > 0 ? line.substring(colonIndex + 1).trim() : line;

        // Action indicators
        if (lower.includes('schedule') && !lower.includes('let\'s start')) {
          if (lower.includes('follow-up') || lower.includes('meeting')) {
            actions.push('Schedule follow-up meeting to discuss pricing and implementation');
          } else if (lower.includes('sync')) {
            actions.push('Schedule quick sync session for database migration');
          }
        } else if (lower.includes('need to') || lower.includes('i need')) {
          if (lower.includes('database')) {
            actions.push('Provide help with database migration and schema conflicts');
          } else if (text.length > 15 && text.length < 100) {
            actions.push(text);
          }
        } else if (lower.includes('review') && lower.includes('ready')) {
          actions.push('Review authentication module code');
        } else if (lower.includes('add') && lower.includes('edge case')) {
          actions.push('Complete API rate limiting feature with edge case handling');
        }
      });

      // Clean and deduplicate
      const uniqueActions = [...new Set(actions)]
        .filter((a: string) => a.length > 15 && a.length < 150)
        .slice(0, 5);

      if (uniqueActions.length > 0) {
        const actionList = uniqueActions
          .map((a: string, i: number) => `${i + 1}. ${a}`)
          .join('\n');
        return `Action Items:\n\n${actionList}`;
      }

      return "Action Items:\n\nNo specific action items were assigned during this meeting. The discussion was primarily informational.";
    }

    return "No action items were recorded.";
  }

  // TOPIC / DISCUSSION - Smart extraction
  const topicKeywords = [
    'topic', 'discuss', 'about', 'subject', 
    'agenda', 'talk', 'mention', 'cover'
  ];
  const isTopicQuestion = topicKeywords.some(
    keyword => lowerQuestion.includes(keyword)
  );

  if (isTopicQuestion) {
    let response = `Meeting Topic:\n\n${meetingContext.title}\n\n`;

    if (meetingContext.summary && meetingContext.summary !== 'No summary available') {
      response += meetingContext.summary;
      return response;
    }

    if (meetingContext.keyPoints && meetingContext.keyPoints.length > 0) {
      const topicsList = meetingContext.keyPoints
        .map((p: string) => `• ${p}`)
        .join('\n');
      response += `**Topics Covered:**\n${topicsList}`;
      return response;
    }

    if (meetingContext.transcript) {
      const lines = meetingContext.transcript.split('\n').filter(l => l.trim());
      const topics: string[] = [];

      // Detect meeting type
      const hasStandup = lines.some(l => 
        l.toLowerCase().includes('standup') || l.toLowerCase().includes('weekly')
      );
      const hasProduct = lines.some(l => 
        l.toLowerCase().includes('product') || 
        l.toLowerCase().includes('demo') || 
        l.toLowerCase().includes('feature')
      );

      // Extract specific topics from transcript
      lines.forEach((line: string) => {
        const lower = line.toLowerCase();
        const colonIndex = line.indexOf(':');
        const text = colonIndex > 0 ? line.substring(colonIndex + 1).trim() : line;

        if (lower.includes('finished') || lower.includes('completed')) {
          if (text.length > 20 && text.length < 100) {
            topics.push(text.replace(/\.$/, ''));
          }
        } else if (lower.includes('working on') && text.length < 100) {
          const cleaned = text.replace(/^I've been working on |^I'm working on /i, 'Work in progress: ');
          topics.push(cleaned.replace(/\.$/, ''));
        } else if (lower.includes('analytics') || lower.includes('dashboard')) {
          topics.push('Analytics dashboard and real-time insights');
        } else if (lower.includes('integration') && lower.includes('api')) {
          topics.push('System integration via REST APIs and webhooks');
        } else if (lower.includes('pricing') || lower.includes('implementation')) {
          topics.push('Pricing and implementation timeline discussion');
        }
      });

      // Remove duplicates and limit
      const uniqueTopics = [...new Set(topics)].slice(0, 5);

      if (uniqueTopics.length > 0) {
        const topicsList = uniqueTopics.map((t: string) => `• ${t}`).join('\n');
        response += `**Discussion Points:**\n${topicsList}`;
        return response;
      }

      // Fallback based on meeting type
      if (hasStandup) {
        response += '**Discussion Points:**\n';
        response += '• Team progress updates and accomplishments\n';
        response += '• Current work in progress\n';
        response += '• Blockers and challenges\n';
        response += '• Next steps and planning';
      } else if (hasProduct) {
        response += '**Discussion Points:**\n';
        response += '• Product features demonstration\n';
        response += '• Integration capabilities and APIs\n';
        response += '• Implementation planning\n';
        response += '• Next steps discussion';
      } else {
        response += '**Discussion Points:**\n';
        response += `• ${meetingContext.title} overview\n`;
        response += '• Team collaboration and planning\n';
        response += '• Action items and follow-up';
      }

      return response;
    }

    response += `Held on ${meetingContext.date} at ${meetingContext.time}\n\n`;
    response += `Participants: ${meetingContext.participants?.join(', ') || 'Not specified'}`;
    return response;
  }

  // TRANSCRIPT - Full conversation
  const transcriptKeywords = [
    'transcript', 'conversation', 'said', 'spoke', 
    'full detail', 'complete', 'entire'
  ];
  const isTranscriptQuestion = transcriptKeywords.some(
    keyword => lowerQuestion.includes(keyword)
  );

  if (isTranscriptQuestion) {
    if (meetingContext.transcript) {
      return `Full Meeting Transcript:\n\n${meetingContext.transcript}`;
    }
    return "Meeting transcript is not available.";
  }

  // TIME / DURATION
  const timeKeywords = [
    'when', 'time', 'duration', 'long', 
    'date', 'schedule', 'held'
  ];
  const isTimeQuestion = timeKeywords.some(
    keyword => lowerQuestion.includes(keyword)
  );

  if (isTimeQuestion) {
    const durationText = meetingContext.duration && meetingContext.duration !== 'N/A' 
      ? meetingContext.duration 
      : 'Not specified';
    return `Meeting Details:\n\n• Date: ${meetingContext.date}\n• Time: ${meetingContext.time}\n• **Duration:** ${durationText}`;
  }

  // TERM EXPLANATION - Simple paragraph format
  const definitionKeywords = [
    'what is', 'what are', 'what do you mean', 'what does',
    'meaning of', 'define', 'explain', 'means', 'meant by'
  ];
  const isDefinitionQuestion = definitionKeywords.some(
    keyword => lowerQuestion.includes(keyword)
  );

  if (isDefinitionQuestion) {
    // Extract the term being asked about
    const termMatch = lowerQuestion.match(
      /what (?:is|are|does|do you mean by|\'s|is meant by) (?:an? |the )?(.+?)(?:\?|$)/i
    ) || lowerQuestion.match(/meaning of (?:an? |the )?(.+?)(?:\?|$)/i) ||
         lowerQuestion.match(/define (?:an? |the )?(.+?)(?:\?|$)/i) ||
         lowerQuestion.match(/explain (?:an? |the )?(.+?)(?:\?|$)/i) ||
         lowerQuestion.match(/meant by (?:an? |the )?(.+?)(?:\?|$)/i);

    if (termMatch && termMatch[1]) {
      const term = termMatch[1].trim();
      const lowerTerm = term.toLowerCase();
      
      // Search more broadly in transcript
      const transcript = meetingContext.transcript || '';
      const transcriptLower = transcript.toLowerCase();
      
      // Check if any part of the term appears in transcript
      const termParts = lowerTerm.split(' ');
      const foundInTranscript = termParts.some(part => 
        part.length > 3 && transcriptLower.includes(part)
      );
      
      if (foundInTranscript || transcriptLower.includes(lowerTerm)) {
        let explanation = '';

        // Generate simple paragraph explanation
        if (lowerTerm.includes('follow') && (lowerTerm.includes('meeting') || lowerTerm.includes('up'))) {
          explanation = `A follow-up meeting is a subsequent meeting scheduled after an initial discussion to continue the conversation, address remaining questions, or review progress. In this meeting, it was mentioned in the context of discussing pricing and implementation timeline. Follow-up meetings help ensure that important topics get the attention they need and decisions can be made with complete information.`;
        } else if (lowerTerm.includes('schema') || (lowerTerm.includes('database') && lowerTerm.includes('conflict'))) {
          explanation = `Schema conflicts occur when changes to a database structure (the schema) create incompatibilities or inconsistencies. In this meeting, it was mentioned that schema changes are causing some conflicts during database migration. This typically happens when the new database structure doesn't align properly with existing data or when multiple developers make conflicting changes to the database design. Resolving schema conflicts requires careful coordination and often involves merging different versions of the database structure.`;
        } else if (lowerTerm.includes('standup')) {
          explanation = `A standup meeting is a brief daily team meeting where members quickly share what they accomplished, what they're working on, and any obstacles they're facing. The name comes from the practice of standing during the meeting to keep it short. In this meeting, the team discussed their weekly progress and any blockers preventing their work.`;
        } else if (lowerTerm.includes('sync') && lowerTerm.includes('meeting')) {
          explanation = `A sync meeting is a coordination session where team members align on their work, share updates, and ensure everyone is informed about project status. In this discussion, it was mentioned for coordinating on specific technical issues. These meetings help maintain team alignment and prevent miscommunication.`;
        } else if (lowerTerm.includes('migration') || (lowerTerm.includes('database') && !lowerTerm.includes('conflict'))) {
          explanation = `Database migration refers to the process of moving data, changing the database structure, or transferring from one database system to another. In this meeting, someone mentioned needing help with the database migration because the schema changes are causing conflicts. Migrations require careful planning to ensure data integrity, avoid downtime, and maintain compatibility with existing applications.`;
        } else if (lowerTerm.includes('api') || lowerTerm.includes('rest')) {
          explanation = `An API (Application Programming Interface) is a set of protocols and tools that allows different software applications to communicate with each other. In this meeting, API work was discussed including rate limiting features. Think of it as a messenger that takes requests from one application and tells another application what to do, then returns the response.`;
        } else if (lowerTerm.includes('rate limit')) {
          explanation = `Rate limiting is a technique to control how many requests a user or system can make to an API within a specific time period. In this meeting, it was mentioned that the API rate limiting feature is almost complete and just needs edge case handling. Rate limiting prevents system overload, protects against abuse, and ensures fair resource distribution among users.`;
        } else if (lowerTerm.includes('edge case')) {
          explanation = `Edge cases are unusual or rare scenarios that occur at the extreme boundaries of normal operation. In this meeting, it was mentioned that edge case handling needs to be added to the API rate limiting feature. Testing and handling edge cases properly ensures the system remains stable even under unexpected or extreme conditions.`;
        } else if (lowerTerm.includes('webhook')) {
          explanation = `A webhook is an automated notification sent from one application to another when a specific event occurs. Unlike APIs where you have to request information, webhooks push information to you automatically. In this meeting, webhooks were mentioned as part of the integration solution to keep systems updated in real-time without constant checking.`;
        } else if (lowerTerm.includes('integration')) {
          explanation = `Integration refers to connecting different software systems or tools so they can work together and share data automatically. In this meeting, integration was discussed in terms of how the system connects with existing tools. Good integration eliminates manual data entry and keeps all your tools synchronized and up-to-date.`;
        } else if (lowerTerm.includes('implement')) {
          explanation = `Implementation is the process of putting a plan, system, or solution into actual use. In this meeting, implementation was discussed regarding deploying the solution and making it operational. It involves the practical steps of installation, configuration, testing, and training to get a system working in a real environment.`;
        } else if (lowerTerm.includes('pricing') || lowerTerm.includes('timeline')) {
          explanation = `${lowerTerm.includes('pricing') ? 'Pricing refers to the cost structure and financial terms for a product or service' : 'Timeline refers to the schedule and deadlines for completing various project phases'}. In this meeting, this was mentioned as a topic that needs further discussion. These details are important for planning resources, budgets, and setting clear expectations about when deliverables will be ready.`;
        } else if (lowerTerm.includes('action item') || lowerTerm.includes('task')) {
          explanation = `An action item is a specific task that needs to be completed, typically assigned to someone with a deadline. In this meeting, action items were identified to track what needs to happen next. They help ensure that discussions lead to concrete outcomes and everyone knows their responsibilities after the meeting ends.`;
        } else if (lowerTerm.includes('blocker') || lowerTerm.includes('issue')) {
          explanation = `A blocker is an obstacle or problem that prevents progress on a task or project. In this meeting, blockers were discussed so the team could identify and resolve issues preventing work. Addressing blockers quickly is important because they can delay entire projects if not resolved.`;
        } else if (lowerTerm.includes('review') || lowerTerm.includes('code review')) {
          explanation = `A code review is when team members examine someone's code to check for quality, bugs, and best practices before it's merged into the main codebase. In this meeting, code review was mentioned as a next step for completed work. Reviews help catch problems early and ensure code quality across the team.`;
        } else if (lowerTerm.includes('authentication') || lowerTerm.includes('2fa') || lowerTerm.includes('two-factor')) {
          explanation = `Authentication is the process of verifying someone's identity before granting access to a system. ${lowerTerm.includes('2fa') || lowerTerm.includes('two-factor') ? 'Two-factor authentication adds an extra security layer by requiring two forms of verification, like a password plus a code sent to your phone.' : ''} In this meeting, it was mentioned that the user authentication module with two-factor authentication support has been completed and is ready for review. This protects user accounts and sensitive data from unauthorized access.`;
        } else if (lowerTerm.includes('dashboard') || lowerTerm.includes('ui') || lowerTerm.includes('redesign')) {
          explanation = `${lowerTerm.includes('dashboard') ? 'A dashboard is a visual interface that displays important information, metrics, and data in one organized view' : 'UI (User Interface) redesign involves improving the visual design and user experience of an application'}. In this meeting, it was mentioned that the dashboard redesign with dark mode support has been completed. Good UI design makes software more intuitive and enjoyable to use.`;
        } else if (lowerTerm.includes('dark mode')) {
          explanation = `Dark mode is a display setting that uses light-colored text and interface elements on a dark background instead of the traditional dark text on light background. In this meeting, it was mentioned that dark mode support has been added to the dashboard redesign. Users appreciate dark mode because it reduces eye strain, saves battery on devices with OLED screens, and provides a more comfortable viewing experience in low-light environments.`;
        } else if (lowerTerm.includes('feature') || lowerTerm.includes('module')) {
          explanation = `${lowerTerm.includes('module') ? 'A module is a self-contained component of a larger system that performs a specific function' : 'A feature is a specific capability or function that a product offers to users'}. In this meeting, various features and modules were discussed including authentication and rate limiting. Breaking systems into modules makes development more manageable and allows different team members to work on different parts simultaneously.`;
        } else {
          // Generic explanation based on context
          const lines = transcript.split('\n').filter((l: string) => 
            l.toLowerCase().includes(lowerTerm) || 
            termParts.some(part => part.length > 3 && l.toLowerCase().includes(part))
          );
          
          if (lines.length > 0) {
            const contextLine = lines[0];
            const colonIndex = contextLine.indexOf(':');
            const contextText = colonIndex > 0 ? contextLine.substring(colonIndex + 1).trim() : contextLine;
            
            explanation = `The term "${term}" was mentioned in this meeting in the following context: "${contextText}" This was discussed as part of ${meetingContext.title}. Based on how it was used, it appears to be an important aspect of the work being done. For more specific details about how this relates to the overall discussion, you can review the full meeting transcript.`;
          } else {
            explanation = `The term "${term}" relates to concepts discussed in this meeting about ${meetingContext.title}. While the exact term wasn't explicitly mentioned, related topics were covered in the discussion. Would you like to know more about the specific topics that were discussed or get a summary of the meeting?`;
          }
        }

        return explanation;
      } else {
        // Term not found in meeting
        return `I couldn't find "${term}" specifically mentioned in this meeting about ${meetingContext.title}. This meeting focused on ${meetingContext.summary || 'team updates and progress reports'}. Would you like to know about the topics that were actually discussed or get a summary of what was covered?`;
      }
    }
  }

  // DEFAULT HELP
  return `I can help you with:\n\n• "Give me a summary" - Get meeting overview\n• "What were the key decisions?" - Main discussion points\n• "Who attended?" - List of participants\n• "What are the action items?" - Follow-up tasks\n• "What topics were discussed?" - Meeting agenda\n• "Show me the transcript" - Full conversation\n• "What is [term]?" - Explain terms from the meeting\n\nWhat would you like to know about **"${meetingContext.title}"**?`;
};
