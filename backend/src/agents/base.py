"""
Base Agent & Tool Classes
==========================
Foundation classes for all HuntZen agents.

Architecture:
- BaseAgent: Abstract class for main agents
- BaseTool: LangChain-compatible tool wrapper
- SubAgent: Lightweight agent for delegation
"""

import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Callable, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import BaseTool as LangChainBaseTool
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field

from src.config.settings import settings

logger = logging.getLogger(__name__)


def load_prompt(filename: str) -> str:
    """
    Load a prompt from the prompts directory.
    
    Args:
        filename: Name of the prompt file (e.g., 'coach_main.txt')
        
    Returns:
        Prompt content as string
    """
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
        
        # Initialize LLM
        self.llm = ChatGroq(
            model=config.model,
            api_key=settings.get_groq_key(),
            temperature=config.temperature,
            max_tokens=config.max_tokens,
        )
        
        # Load system prompt
        self.system_prompt = self._load_system_prompt(config)
        
        logger.info(f"[{self.name}] Agent initialized with {config.model}")
    
    def _load_system_prompt(self, config: AgentConfig) -> str:
        """Load system prompt from file or config."""
        if config.system_prompt:
            return config.system_prompt
        
        if config.system_prompt_file:
            prompt_path = Path(__file__).parent.parent.parent / "prompts" / config.system_prompt_file
            if prompt_path.exists():
                return prompt_path.read_text(encoding="utf-8")
            logger.warning(f"[{self.name}] Prompt file not found: {prompt_path}")
        
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
        response = await self.llm.ainvoke(messages)
        return response.content
    
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
        
        self.llm = ChatGroq(
            model=model,
            api_key=settings.get_groq_key(),
            temperature=temperature,
            max_tokens=max_tokens,
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
        
        response = await self.llm.ainvoke(messages)
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
