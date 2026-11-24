from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# -----------------------------------------------------------------------------
# Game Models
# -----------------------------------------------------------------------------
class RuleSettingOption(BaseModel):
    id: str
    name: str
    type: str = "select"  # select, text, number
    default: Optional[Any] = None
    options: Optional[List[str]] = None


class PlayerMetricOption(BaseModel):
    id: str
    name: str
    type: str = "number"  # number, string, select
    options: Optional[List[str]] = None


class GameBase(BaseModel):
    id: str
    name: str
    icon: str = "🎮"
    description: Optional[str] = ""
    scoring_type: str = "points_high"  # points_high, points_low, placement
    default_points_system: List[int] = Field(default_factory=list)
    match_types: List[str] = Field(default_factory=list)
    rule_settings: List[Dict[str, Any]] = Field(default_factory=list)
    player_metrics: List[Dict[str, Any]] = Field(default_factory=list)
    is_active: bool = True


class GameCreate(GameBase):
    pass


class GameUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    description: Optional[str] = None
    scoring_type: Optional[str] = None
    default_points_system: Optional[List[int]] = None
    match_types: Optional[List[str]] = None
    rule_settings: Optional[List[Dict[str, Any]]] = None
    player_metrics: Optional[List[Dict[str, Any]]] = None
    is_active: Optional[bool] = None


# -----------------------------------------------------------------------------
# Player Models
# -----------------------------------------------------------------------------
class PlayerBase(BaseModel):
    name: str
    nickname: Optional[str] = None
    email: Optional[str] = None
    color_hex: Optional[str] = "#3b82f6"


class PlayerCreate(PlayerBase):
    pass


class PlayerUpdate(BaseModel):
    name: Optional[str] = None
    nickname: Optional[str] = None
    email: Optional[str] = None
    color_hex: Optional[str] = None


class PlayerResponse(PlayerBase):
    id: int
    avatar_url: Optional[str] = None
    created_at: str
    total_matches: int = 0
    wins: int = 0
    win_rate: float = 0.0


# -----------------------------------------------------------------------------
# Session & Match Models
# -----------------------------------------------------------------------------
class SessionCreate(BaseModel):
    game_id: str
    title: str
    notes: Optional[str] = None
    player_ids: List[int] = Field(default_factory=list)


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None  # active, completed
    ended_at: Optional[str] = None


class MatchScoreInput(BaseModel):
    player_id: int
    score: float = 0.0
    rank_position: int = 1
    metrics: Dict[str, Any] = Field(default_factory=dict)


class RaceScoreInput(BaseModel):
    player_id: int
    position: int = 1
    points: float = 0.0


class MatchRaceInput(BaseModel):
    race_number: int
    cup_name: Optional[str] = None
    track_name: str
    class_mode: Optional[str] = None
    scores: List[RaceScoreInput] = Field(default_factory=list)


class MatchCreate(BaseModel):
    match_type: str
    rule_values: Dict[str, Any] = Field(default_factory=dict)
    is_practice: bool = False
    notes: Optional[str] = None
    scores: List[MatchScoreInput] = Field(default_factory=list)
    races: List[MatchRaceInput] = Field(default_factory=list)


class MatchResponse(BaseModel):
    id: int
    session_id: int
    match_number: int
    match_type: str
    rule_values: Dict[str, Any]
    is_practice: bool
    notes: Optional[str]
    played_at: str
    scores: List[Dict[str, Any]] = Field(default_factory=list)


class SessionDetailResponse(BaseModel):
    id: int
    game_id: str
    game_name: str
    game_icon: str
    title: str
    status: str
    started_at: str
    ended_at: Optional[str]
    notes: Optional[str]
    players: List[Dict[str, Any]]
    matches: List[MatchResponse]
    standings: List[Dict[str, Any]]
