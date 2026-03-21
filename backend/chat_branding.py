"""Quick terminal chat with the Branding Agent."""
import asyncio
import os

# Load env before anything else (env file is at repo root)
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from src.agents.branding.main_agent import BrandingAgent


async def main():
    agent = BrandingAgent()
    history = []
    state = None

    print("\n" + "=" * 60)
    print("🎨 HuntZen Branding Agent — Terminal Chat")
    print("Tape 'quit' pour quitter")
    print("=" * 60 + "\n")

    while True:
        try:
            msg = input("👤 Toi: ").strip()
        except (EOFError, KeyboardInterrupt):
            break

        if not msg or msg.lower() in ("quit", "exit", "q"):
            print("\n👋 À plus !")
            break

        result = await agent.run(
            message=msg,
            history=history,
            language="fr",
            branding_state=state,
        )

        response = result["response"]
        state = result.get("branding_state", state)

        print(f"\n🤖 Bot: {response}\n")

        # Update history
        history.append({"role": "user", "content": msg})
        history.append({"role": "assistant", "content": response})

        # Keep last 20
        if len(history) > 20:
            history = history[-20:]


if __name__ == "__main__":
    asyncio.run(main())
