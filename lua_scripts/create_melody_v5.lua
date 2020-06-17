ardour {
	["type"]    = "EditorAction",
	name        = "Create Melody",
	author      = "M. Schott",
	description = "Connect to Electron App / export chords from region if selected",
}

function factory () return function ()
    ---------------------------
    -- setup vars
    ---------------------------
    -- file paths and names
    local home_dir = os.getenv ( "HOME" )
    local dir_path = ARDOUR.LuaAPI.build_filename(home_dir, "ardour_electron")  
    local conn_file_path = ARDOUR.LuaAPI.build_filename(dir_path, "connected.txt")
    local chords_file_path = ARDOUR.LuaAPI.build_filename(dir_path, "chords.mid")
    -- osc communication
    local uri = "osc.udp://localhost:7890"
    local tx = ARDOUR.LuaOSC.Address (uri)
    -- time related 
    local sr = Session:nominal_frame_rate ()
    local tm = Session:tempo_map ()
    local length_in_time = 0
    local bpm = 0
    local meter_divisions = 0
    local meter_divisor = 0
    -- Custom data structures
    local sel_region = {}
    local midi_region = {}
    local notes_from_midi_region = {}
    -- boolean flag to check if chords were exported
    local exp_chords = false
    -- get time stamp
    local old_time = os.time()
    ---------------------------
    -- function declarations
    ---------------------------
    -- file and path check
    function file_exists(name)
      local f=io.open(name,"r")
      if f~=nil then io.close(f) return true else return false end
    end

    function export_chords()
      midi_region:do_export(chords_file_path)
    end

    -- send basic sequencer tempo/time info
    function get_seq_info()
      -- meter section taken at current timeline position
      local meter_section = Session:tempo_map():meter_section_at_frame (Session:transport_frame ())
      meter_divisions = meter_section:to_meter():divisions_per_bar ()
      meter_divisor = meter_section:to_meter():note_divisor ()
      -- bpm calculation
      bpm = Session:tempo_map():exact_qn_at_frame(sr, 0) * 60   
      -- tx:send ("SEQ_INFO", "ddd", bpm, meter_divisions, meter_divisor)
    end

    function check_for_chord_region() 
      -- allow for only one region to be selected
      local sel = Editor:get_selection ()
      if sel.regions:regionlist():size() == 1 then
        -- create midi region from region selected in editor window
        sel_region = sel.regions:regionlist():table()[1]
    	midi_region = sel_region:to_midiregion()
        -- restrict region length to 8bars (for now!)
        if midi_region:length_beats () / meter_divisions > 8 then
          -- create dialog, further processing is halted until user hits 'OK'
	  local md = LuaDialog.Message
            ("Region Error", "Selected region omitted. Please provide a region not longer than 8 bars.",
            LuaDialog.MessageType.Info, LuaDialog.ButtonType.Close)
            md:run()
            md = nil 
        else 
	  export_chords()
	  exp_chords = true
	  -- tx:send ("CHORDS", "s", "")
        end
      end
    end

    function send_data()
      get_seq_info()
      check_for_chord_region()
      tx:send ("SEQ_INFO", "dddT", bpm, meter_divisions, meter_divisor, exp_chords)   
    end
    ---------------------------
    -- START of Script Logic
    ---------------------------
    -- try to connect to Electron App
    tx:send ("CONNECT", "s", "")
    -- check if Electron app is running 
    while true do
	if file_exists(conn_file_path) then 
        	-- call main function
		send_data()
        	-- delete "connection marker" file before script ends, 
		-- check for sys (substring '/' for unix sys)
        	if (os.getenv ( "HOME" ):sub(0,1) == '/') then
		    os.execute("rm " .. conn_file_path)
		else
		    os.execute("del " .. conn_file_path)
		end	
		goto finish_script
        elseif os.difftime(os.time(), old_time) >= 5 then
            local md = LuaDialog.Message
            ("Timeout", "Please start the Electron App and rerun the script.",
            LuaDialog.MessageType.Info, LuaDialog.ButtonType.Close)
            md:run()
            md = nil 
            goto finish_script
        end
    end
      ---------------------------   
      ::finish_script:: 
      collectgarbage ()
end end