ardour {
	["type"]    = "EditorHook",
	name        = "Check if file exists",
	author      = "M. Schott",
	description = "Import midi file when it exists",
}

function signals ()
  return LuaSignal.Set():add ({[LuaSignal.LuaTimerDS] = true})
end

function factory ()
  -- setup filesystem vars
  local home_dir = os.getenv ( "HOME" );
  local dir_path = ARDOUR.LuaAPI.build_filename(home_dir, "ardour_electron") 
  local melody_file = ARDOUR.LuaAPI.build_filename(dir_path, "melody.mid")
  local chords_file = ARDOUR.LuaAPI.build_filename(dir_path, "chordsNew.mid")

  -- midi import
  function import_midi(_file)
    local pos = 0
    local file = C.StringVector()
    file:push_back(_file)

    Editor:do_import (file,
                      Editing.ImportDistinctFiles, Editing.ImportAsTrack, ARDOUR.SrcQuality.SrcBest,
                      ARDOUR.MidiTrackNameSource.SMFTrackName, ARDOUR.MidiTempoMapDisposition.SMFTempoIgnore,
                      pos, ARDOUR.PluginInfo()) 
  
    local track_no = Session:get_tracks():size()
    local route = Session:get_remote_nth_route(track_no-1)
    local new = ARDOUR.LuaAPI.new_plugin(Session, "http://gareus.org/oss/lv2/gmsynth", ARDOUR.PluginType.LV2, "");
    route:add_processor_by_index (new, 0, nil, true)
    -- old = nil new = nil -- explicitly drop references (unless they're local vars)
  end

  -- file and path check
  function file_exists(name)
    local f=io.open(name,"r")
    if f~=nil then io.close(f) return true else return false end
  end

  return function (signal, ref, ...)
    if file_exists(melody_file) then 
      import_midi(melody_file)
      -- delete midi file when loaded in session, check for os (substr '/' for unix like os)
      if (os.getenv( "HOME" ):sub(0,1) == '/') then
	      os.execute("rm " .. melody_file) 
      else
	      os.execute("del " .. melody_file)
      end 
    end    
    if file_exists(chords_file) then 
      import_midi(chords_file)
      -- delete midi file when loaded in session, check for os (substr '/' for unix like os)
      if (os.getenv( "HOME" ):sub(0,1) == '/') then
	      os.execute("rm " .. chords_file) 
      else
	      os.execute("del " .. chords_file)
      end 
    end
  end
end
