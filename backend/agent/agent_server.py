from flask import Flask, jsonify
from flask_cors import CORS
from monitoring_service import init_stats_routes, register_agent_with_manager
from container_manager import init_backend_routes
import toml
from datetime import datetime
import sys
import threading

import os
from dotenv import load_dotenv
from loguru import logger

# Load environment variables
load_dotenv(".env", override=True)

# Validate configuration before starting
from config_validator import validate_agent_config, ConfigValidationError
try:
    validate_agent_config(strict=True)
except ConfigValidationError as e:
    logger.error(f"Agent configuration validation failed: {e}")
    logger.error("Please fix the configuration issues and restart the agent.")
    sys.exit(1)

app = Flask(__name__)
CORS(app)

# Initialize routes from both modules
init_stats_routes(app)
init_backend_routes(app)

# Health check endpoint for Docker
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for Docker container monitoring."""
    try:
        # Check if Docker is available
        import docker
        docker_status = "healthy"
        try:
            client = docker.from_env()
            client.ping()
            client.close()
        except Exception as e:
            docker_status = f"unhealthy: {str(e)}"
        
        # Overall health status
        overall_status = "healthy" if docker_status == "healthy" else "unhealthy"
        
        response = {
            "status": overall_status,
            "timestamp": datetime.now().isoformat(),
            "version": "1.0.0",
            "service": "agent",
            "docker": docker_status,
            "port": int(os.getenv('AGENT_PORT', '8510'))
        }
        
        status_code = 200 if overall_status == "healthy" else 503
        return jsonify(response), status_code
        
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        }), 503

if __name__ == '__main__':
    config_path = os.path.join('config.toml')
    port = 8510
    
    if os.path.exists(config_path):
        try:
            config = toml.load(config_path)
            port = config.get('agent', {}).get('port', port)
        except Exception as e:
            print(f"Error loading config: {e}")
    
    print(f"Starting agent server on port {port}")
    threading.Thread(target=register_agent_with_manager, daemon=True, name='agent-registration').start()
    app.run(host='0.0.0.0', port=port, debug=False)
