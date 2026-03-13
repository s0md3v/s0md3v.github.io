import os
import json
import requests
import yaml
import time

# Use GitHub Token from environment
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
USERNAME = "s0md3v"

# Projects on PyPI to track downloads for
PYPI_PROJECTS = [
    "arjun", "wappalyzer", "xsstrike", "uro", "parth", "fonetic", 
    "esprima2", "rewise", "ote", "ifnude", "hardocdes", "json2paths", 
    "huepy", "photon"
]

HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28"
} if GITHUB_TOKEN else {
    "Accept": "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28"
}

def get_repos(username):
    repos = []
    page = 1
    while True:
        url = f"https://api.github.com/users/{username}/repos?per_page=100&page={page}"
        response = requests.get(url, headers=HEADERS)
        if response.status_code != 200:
            break
        data = response.json()
        if not data:
            break
        repos.extend(data)
        page += 1
    return repos

def get_repo_clones(full_name):
    # GitHub API only returns clone traffic for the last 14 days.
    url = f"https://api.github.com/repos/{full_name}/traffic/clones"
    response = requests.get(url, headers=HEADERS)
    if response.status_code != 200:
        return 0
    return response.json().get("count", 0)

def get_pypi_downloads(project):
    url = f"https://pypistats.org/api/packages/{project}/recent"
    try:
        response = requests.get(url)
        if response.status_code == 200:
            return response.json().get("data", {}).get("last_month", 0)
    except Exception:
        pass
    return 0

def main():
    print(f"Fetching GitHub repositories for {USERNAME}...")
    repos = get_repos(USERNAME)
    
    total_stars = sum(repo['stargazers_count'] for repo in repos)
    repo_stars_map = {repo['name'].lower(): repo['stargazers_count'] for repo in repos}
    
    print(f"Total Stars: {total_stars}")
    
    total_github_clones = 0
    for repo in repos:
        # Skip forks to get accurate personal impact
        if not repo['fork']:
            clones = get_repo_clones(repo['full_name'])
            total_github_clones += clones
            time.sleep(0.1) # Be nice to the API
            
    print(f"GitHub Clones (14 days): {total_github_clones}")
    
    total_pypi_downloads = 0
    for project in PYPI_PROJECTS:
        downloads = get_pypi_downloads(project)
        total_pypi_downloads += downloads
        time.sleep(0.1)
        
    print(f"PyPI Downloads (Monthly): {total_pypi_downloads}")
    
    # Estimate Monthly Impact: GitHub Clones (14d * 2.1 to approximate 30d) + PyPI (Monthly)
    monthly_impact = int(total_github_clones * 2.1) + total_pypi_downloads
    
    # Formatting for the website (e.g., 102k+, 120k+, 2M+)
    def format_number(n):
        if n >= 1000000:
            return f"{n / 1000000:.1f}M+".replace(".0", "")
        if n >= 1000:
            return f"{n // 1000}k+"
        return str(n)

    stats = {
        "total_stars": format_number(total_stars),
        "monthly_downloads": format_number(monthly_impact),
        "total_projects": len([r for r in repos if not r['fork'] and r['stargazers_count'] > 100]),
        "last_updated": time.strftime("%d %b %Y")
    }
    
    print(f"Calculated Stats: {stats}")
    
    # Ensure _data directory exists
    os.makedirs("_data", exist_ok=True)
    
    with open("_data/stats.json", "w") as f:
        json.dump(stats, f, indent=2)
        
    # Update projects.yaml with fresh star counts
    if os.path.exists("_data/projects.yaml"):
        with open("_data/projects.yaml", "r") as f:
            projects = yaml.safe_load(f)
            
        if projects:
            for project in projects:
                title_lower = project['title'].lower()
                if title_lower in repo_stars_map:
                    project['stars'] = repo_stars_map[title_lower]
                    
            with open("_data/projects.yaml", "w") as f:
                yaml.dump(projects, f, sort_keys=False, default_flow_style=False)

if __name__ == "__main__":
    main()
