import sys
import click
from rich.console import Console
from rich.table import Table

from .api import APIClient, APIError
from .config import get_token, get_api_url, save_token, clear_token

console = Console()


@click.command()
@click.option("--email", prompt="Email", help="Your account email address.")
@click.option(
    "--password",
    prompt="Password",
    hide_input=True,
    help="Your account password.",
)
@click.pass_context
def login(ctx, email, password):
    """Log in and save credentials to ~/.gpu-dash.json."""
    # CLI flag token takes precedence; but for login we always re-authenticate
    client = APIClient()
    try:
        result = client.post("/api/login", {"email": email, "password": password})
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)

    if not result.get("success"):
        console.print(f"[red]Error:[/red] {result.get('error', 'Login failed')}")
        sys.exit(1)

    data = result["data"]
    token = data["token"]
    api_url = get_api_url()
    save_token(token, api_url)

    console.print(f"[green]Logged in[/green] as [bold]{data['name']}[/bold] "
                  f"([dim]{data['email']}[/dim], role: {data['role']})")


@click.command()
def logout():
    """Remove saved credentials."""
    clear_token()
    console.print("Logged out.")


@click.command()
@click.pass_context
def whoami(ctx):
    """Show the currently authenticated user."""
    token = get_token(ctx.obj.get("token"))
    if not token:
        console.print("[red]Error:[/red] Not logged in. Run [bold]gpu-dash login[/bold] first.")
        sys.exit(1)

    client = APIClient(token=token)
    try:
        result = client.get("/api/validate-session")
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)

    if not result.get("success"):
        console.print(f"[red]Error:[/red] {result.get('error', 'Session invalid')}")
        sys.exit(1)

    session = result["session"]

    table = Table(show_header=True, header_style="bold cyan")
    table.add_column("Field")
    table.add_column("Value")

    table.add_row("id", str(session.get("id", "")))
    table.add_row("username", session.get("username", ""))
    table.add_row("email", session.get("email", ""))
    table.add_row("user_type", session.get("user_type", ""))
    table.add_row("status", "approved" if session.get("is_approved") else "pending")

    console.print(table)
