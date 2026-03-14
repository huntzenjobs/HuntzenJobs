"""
Base Agent & Tool Classes
==========================
Foundation classes for all HuntZen agents.

Architecture:
- BaseAgent: Abstract class for main agents
- BaseTool: LangChain-compatible tool wrapper
- SubAgent: Lightweight agent for delegation
"""

import asyncio
import json
import logging
import re
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Callable, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import BaseTool as LangChainBaseTool
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field

from src.config.settings import settings
from src.utils.groq_retry import with_groq_retry, with_groq_key_rotation

logger = logging.getLogger(__name__)


def load_prompt(filename: str) -> str:
    """
    Load a prompt — DB first (ai_prompts table), fallback to .txt file.
    The name used for DB lookup is the filename without the .txt extension.
    """
    name = filename.removesuffix(".txt")
    try:
        from src.api.dependencies import get_supabase_client
        supabase = get_supabase_client()
        res = supabase.table("ai_prompts").select("content").eq("name", name).maybe_single().execute()
        if res.data and res.data.get("content"):
            return res.data["content"]
    except Exception as e:
        logger.warning(f"Could not load prompt '{name}' from DB, falling back to file: {e}")

    prompt_path = Path(__file__).parent.parent.parent / "prompts" / filename
    if prompt_path.exists():
        return prompt_path.read_text(encoding="utf-8")
    logger.warning(f"Prompt file not found: {prompt_path}")
    return ""


class AgentConfig(BaseModel):
    """Configuration for an agent."""
    name: str
    model: str = settings.llm_model_fast
    temperature: float = settings.llm_temperature
    max_tokens: int = settings.llm_max_tokens
    system_prompt_file: Optional[str] = None
    system_prompt: Optional[str] = None


class BaseAgent(ABC):
    """
    Abstract base class for all HuntZen agents.
    
    Provides:
    - LLM initialization with Groq
    - System prompt loading from files
    - Message building utilities
    - Sub-agent orchestration pattern
    """
    
    def __init__(self, config: AgentConfig):
        """
        Initialize the agent.
        
        Args:
            config: Agent configuration
        """
        self.name = config.name
        self.config = config
        self._sub_agents: dict[str, "SubAgent"] = {}
        self._tools: list[LangChainBaseTool] = []
        
        # Initialize LLMs — un par clé Groq (rotation anti-429)
        self._llms = [
            ChatGroq(
                model=config.model,
                api_key=key,
                temperature=config.temperature,
                max_tokens=config.max_tokens,
                max_retries=1,  # on gère la rotation nous-mêmes
            )
            for key in settings.get_all_groq_keys()
        ]
        self.llm = self._llms[0]  # compatibilité avec le code existant
        
        # Load system prompt
        self.system_prompt = self._load_system_prompt(config)
        
        logger.info(f"[{self.name}] Agent initialized with {config.model}")
    
    def _load_system_prompt(self, config: AgentConfig) -> str:
        """Load system prompt — DB first, then file, then default."""
        if config.system_prompt:
            return config.system_prompt

        if config.system_prompt_file:
            return load_prompt(config.system_prompt_file)

        return f"You are {self.name}, an AI assistant."
    
    def register_sub_agent(self, sub_agent: "SubAgent") -> None:
        """
        Register a sub-agent for delegation.
        
        Args:
            sub_agent: SubAgent instance to register
        """
        self._sub_agents[sub_agent.name] = sub_agent
        logger.debug(f"[{self.name}] Registered sub-agent: {sub_agent.name}")
    
    def register_tool(self, tool: LangChainBaseTool) -> None:
        """
        Register a tool for the agent.
        
        Args:
            tool: LangChain tool to register
        """
        self._tools.append(tool)
        logger.debug(f"[{self.name}] Registered tool: {tool.name}")
    
    async def delegate_to(self, sub_agent_name: str, **kwargs: Any) -> Any:
        """
        Delegate task to a sub-agent.
        
        Args:
            sub_agent_name: Name of the sub-agent
            **kwargs: Arguments to pass to sub-agent
            
        Returns:
            Sub-agent result
        """
        if sub_agent_name not in self._sub_agents:
            raise ValueError(f"Sub-agent '{sub_agent_name}' not registered")
        
        return await self._sub_agents[sub_agent_name].run(**kwargs)
    
    def build_messages(
        self,
        user_message: str,
        history: Optional[list[dict]] = None,
    ) -> list:
        """
        Build message list for LLM.
        
        Args:
            user_message: Current user message
            history: Conversation history
            
        Returns:
            List of LangChain messages
        """
        messages = [SystemMessage(content=self.system_prompt)]
        
        if history:
            for msg in history:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role == "user":
                    messages.append(HumanMessage(content=content))
                elif role == "assistant":
                    messages.append(AIMessage(content=content))
        
        messages.append(HumanMessage(content=user_message))
        return messages
    
    async def chat(
        self,
        message: str,
        history: Optional[list[dict]] = None,
    ) -> str:
        """
        Simple chat method.
        
        Args:
            message: User message
            history: Conversation history
            
        Returns:
            Agent response
        """
        messages = self.build_messages(message, history)
        try:
            response = await asyncio.wait_for(
                with_groq_key_rotation(
                    self._llms,
                    messages,
                    config={"metadata": {"agent_name": self.name}, "run_name": f"Agent:{self.name}"},
                ),
                timeout=60.0,
            )
        except asyncio.TimeoutError:
            logger.warning(f"LLM timeout after 60s for agent {self.name}")
            return "Le service IA est temporairement surchargé. Réessayez dans quelques instants."
        return response.content
    
    def _parse_json(self, text: str) -> dict | None:
        """
        Parse JSON from LLM response text.
        
        Handles common issues like markdown code blocks and trailing text.
        
        Args:
            text: Raw LLM response text
            
        Returns:
            Parsed dict or None if parsing fails
        """
        if not text:
            return None
        
        try:
            # Try direct parse first
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        
        # Try to extract JSON from markdown code blocks
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass
        
        # Try to find JSON object in text
        brace_match = re.search(r'\{[\s\S]*\}', text)
        if brace_match:
            try:
                return json.loads(brace_match.group(0))
            except json.JSONDecodeError:
                pass
        
        logger.warning(f"[{self.name}] Failed to parse JSON from response")
        return None
    
    def _parse_json_response(self, text: str) -> dict | None:
        """Alias for _parse_json for backwards compatibility."""
        return self._parse_json(text)
    
    @abstractmethod
    async def run(self, **kwargs: Any) -> dict[str, Any]:
        """
        Main execution method - must be implemented by subclasses.
        
        Args:
            **kwargs: Task-specific arguments
            
        Returns:
            Task result
        """
        pass


class SubAgent:
    """
    Lightweight sub-agent for specialized tasks.
    
    Sub-agents are simpler than main agents and focus on
    a single specialized task (e.g., query refinement, scoring).
    """
    
    def __init__(
        self,
        name: str,
        system_prompt: str,
        model: str = settings.llm_model_fast,
        temperature: float = 0.1,
        max_tokens: int = 1024,
    ):
        """
        Initialize sub-agent.
        
        Args:
            name: Sub-agent name
            system_prompt: System prompt for the task
            model: LLM model to use
            temperature: LLM temperature
            max_tokens: Max output tokens
        """
        self.name = name
        self.system_prompt = system_prompt
        
        # max_retries=3 : retry natif LangChain sur 429 (backoff exponentiel intégré)
        self.llm = ChatGroq(
            model=model,
            api_key=settings.get_groq_key(),
            temperature=temperature,
            max_tokens=max_tokens,
            max_retries=3,
        )
        
        logger.debug(f"[SubAgent:{name}] Initialized")
    
    async def run(self, task: str, context: str = "") -> str:
        """
        Execute the sub-agent's task.
        
        Args:
            task: Task description or input
            context: Additional context
            
        Returns:
            Task result
        """
        prompt = f"{context}\n\n{task}" if context else task
        messages = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(content=prompt),
        ]
        
        try:
            response = await asyncio.wait_for(
                with_groq_retry(
                    self.llm.ainvoke,
                    messages,
                    config={"metadata": {"sub_agent_name": self.name}, "run_name": f"SubAgent:{self.name}"},
                ),
                timeout=60.0,  # +15s pour absorber les retries backoff
            )
        except asyncio.TimeoutError:
            logger.warning(f"LLM timeout after 60s for sub-agent {self.name}")
            return "Le service IA est temporairement surchargé. Réessayez dans quelques instants."
        return response.content


class BaseTool(LangChainBaseTool):
    """
    Base class for custom tools.
    
    Wraps external APIs or functions as LangChain tools.
    """
    
    name: str = "base_tool"
    description: str = "A base tool"
    
    def _run(self, *args: Any, **kwargs: Any) -> Any:
        """Synchronous run - not implemented."""
        raise NotImplementedError("Use async version")
    
    async def _arun(self, *args: Any, **kwargs: Any) -> Any:
        """Async run - must be implemented by subclasses."""
        raise NotImplementedError("Subclass must implement _arun")
